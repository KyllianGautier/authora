import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TwoFactorAuthEntity } from '../../../src/entity/two-factor-auth.entity';
import { consumeEmailQueue, getTestApp, resetTestState, setTenantConfig } from '../../setup';
import { createTwoFactorAuth } from '../utils/create-two-factor-auth';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { expirePassword } from '../utils/expire-password';

// Initiates 2FA setup: generates a TOTP secret, returns a QR code and manual code,
// and creates an unverified TwoFactorAuth record in the database.
describe('POST /2fa/setup', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 20_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'user@example.com', password: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'email must be an email',
        'password should not be empty',
        'password must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'unknown@example.com', password: 'password123' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when password is wrong', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'correctPassword'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'user@example.com', password: 'wrongPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 with qrcode and manual code and create a record in database', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.qrcode).toMatch(/^data:image\/png;base64,/);
      expect(response.body.manualCode).toBeDefined();
      expect(typeof response.body.manualCode).toBe('string');
      expect(response.body.manualCode.length).toBeGreaterThan(0);

      // The DB record should be unverified (pending TOTP code confirmation) with no recovery codes yet
      const twoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      expect(twoFactorAuth).not.toBeNull();
      expect(twoFactorAuth!.isVerified).toBe(false);
      expect(twoFactorAuth!.secret).toBe(response.body.manualCode);
      expect(twoFactorAuth!.recoveryCodeHashes).toEqual([]);
    });

    it('should return 409 when two-factor auth is already enabled', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createTwoFactorAuth(dataSource, user, true);

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(409);

      expect(response.body.message).toBe(
        'Two-factor authentication is already enabled'
      );
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'User@Example.COM', password: 'password123' })
        .expect(200);

      expect(response.body.qrcode).toMatch(/^data:image\/png;base64,/);
      expect(response.body.manualCode).toBeDefined();
    });

    it('should allow 2FA setup even when password is expired', async () => {
      await setTenantConfig({ passwordExpirationEnabled: true, passwordMaxAgeSec: 60 });
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      await expirePassword(dataSource, user);

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.qrcode).toMatch(/^data:image\/png;base64,/);
      expect(response.body.manualCode).toBeDefined();
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/2fa/setup')
          .send({ email: 'combined@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'combined@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/2fa/setup')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/2fa/setup')
          .send({ email: `origin-${i}@example.com`, password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/setup')
        .send({ email: 'origin-final@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
