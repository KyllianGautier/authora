import { INestApplication } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TwoFactorAuthEntity } from '../../src/entity/two-factor-auth.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../setup';
import { createTwoFactorAuth } from '../utils/create-two-factor-auth';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { hashVerify } from '../utils/hash';

// Confirms 2FA setup by validating a TOTP code against the pending secret.
// On success, marks the TwoFactorAuth record as verified and generates recovery codes.
describe('POST /2fa/verify', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 120_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  // Generates a time-based TOTP code from the secret stored in the DB factory
  function generateTotpCode(secret: string): string {
    return speakeasy.totp({
      secret,
      encoding: 'base32'
    });
  }

  describe('validation', () => {
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({ password: 'password123', code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'not-an-email',
          password: 'password123',
          code: '123456'
        })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({ email: 'user@example.com', code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({ email: 'user@example.com', password: '', code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty'
      ]);
    });

    it('should return 400 when code is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be longer than or equal to 6 characters',
        'code must be a string'
      ]);
    });

    it('should return 400 when code is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123'
        })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be longer than or equal to 6 characters'
      ]);
    });

    it('should return 400 when code is too long', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '1234567'
        })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be shorter than or equal to 6 characters'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'email must be an email',
        'password should not be empty',
        'password must be a string',
        'code must be longer than or equal to 6 characters',
        'code must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'unknown@example.com',
          password: 'password123',
          code: '123456'
        })
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
        .post('/api/v1/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'wrongPassword',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when no two-factor auth setup exists', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when verification code is invalid', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createTwoFactorAuth(dataSource, user, false);

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '000000'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200, enable two-factor auth and return recovery codes with hashes', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      // Create an unverified 2FA record and generate a valid TOTP code from its secret
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, false);
      const code = generateTotpCode(twoFactorAuth.secret);

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      // Recovery codes are returned in clear text (only time the user sees them)
      expect(response.body.recoveryCodes).toHaveLength(10);
      for (const recoveryCode of response.body.recoveryCodes) {
        expect(recoveryCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      }

      // The record should now be marked as verified with hashed recovery codes
      const updatedTwoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      expect(updatedTwoFactorAuth).not.toBeNull();
      expect(updatedTwoFactorAuth!.isVerified).toBe(true);
      expect(updatedTwoFactorAuth!.recoveryCodeHashes).toHaveLength(10);

      // Verify each clear recovery code matches its corresponding hash in DB
      const clearCodes = response.body.recoveryCodes as string[];
      for (let i = 0; i < clearCodes.length; i++) {
        await expect(
          hashVerify(
            updatedTwoFactorAuth!.recoveryCodeHashes[i],
            clearCodes[i]
          )
        ).resolves.toBe(true);
      }
    });

    it('should normalize email to lowercase', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, false);
      const code = generateTotpCode(twoFactorAuth.secret);

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({
          email: 'User@Example.COM',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.recoveryCodes).toHaveLength(10);
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/2fa/verify')
          .send({ email: 'combined@example.com', password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({ email: 'combined@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/2fa/verify')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/2fa/verify')
          .send({ email: `origin-${i}@example.com`, password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/2fa/verify')
        .send({ email: 'origin-final@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
