import { INestApplication } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OneTimeTokenEntity, OneTimeTokenType } from '../../src/entity/one-time-token.entity';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import { TwoFactorAuthEntity } from '../../src/entity/two-factor-auth.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../setup';
import { createOneTimeToken } from '../utils/create-one-time-token';
import { createRefreshToken } from '../utils/create-refresh-token';
import { createTwoFactorAuth } from '../utils/create-two-factor-auth';
import { createUserWithPassword } from '../utils/create-user-with-password';

// Disables 2FA for a user after verifying password + TOTP code.
// Removes the TwoFactorAuth record and revokes all active refresh tokens and one-time tokens.
describe('POST /2fa/disable', () => {
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
        .post('/2fa/disable')
        .send({ password: 'password123', code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
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
        .post('/2fa/disable')
        .send({ email: 'user@example.com', code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'user@example.com', password: '', code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty'
      ]);
    });

    it('should return 400 when code is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be longer than or equal to 6 characters',
        'code must be a string'
      ]);
    });

    it('should return 400 when code is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
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
        .post('/2fa/disable')
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
        .post('/2fa/disable')
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
        .post('/2fa/disable')
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
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'wrongPassword',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when no two-factor auth exists', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    // A pending (unverified) 2FA setup cannot be "disabled" — it was never enabled
    it('should return 401 when two-factor auth is set up but not verified', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, false);
      const code = generateTotpCode(twoFactorAuth.secret);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
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

      await createTwoFactorAuth(dataSource, user, true);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '000000'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 and remove two-factor auth on valid request', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const code = generateTotpCode(twoFactorAuth.secret);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.message).toBe(
        'Two-factor authentication disabled'
      );

      const found = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      expect(found).toBeNull();
    });

    it('should normalize email to lowercase', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const code = generateTotpCode(twoFactorAuth.secret);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'User@Example.COM',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.message).toBe(
        'Two-factor authentication disabled'
      );
    });

    // Disabling 2FA is a security-sensitive action: all sessions must be invalidated
    it('should revoke all refresh tokens after disabling', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createRefreshToken(dataSource, user);

      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const code = generateTotpCode(twoFactorAuth.secret);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.message).toBe(
        'Two-factor authentication disabled'
      );

      const activeTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { email: 'user@example.com' }, revoked: false } });

      expect(activeTokens).toHaveLength(0);
    });

    // Pending one-time tokens (e.g., account deletion) must also be invalidated
    it('should revoke all one-time tokens after disabling', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createOneTimeToken(dataSource, user, OneTimeTokenType.AccountDeletion);

      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const code = generateTotpCode(twoFactorAuth.secret);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.message).toBe(
        'Two-factor authentication disabled'
      );

      const activeTokens = await dataSource
        .getRepository(OneTimeTokenEntity)
        .find({ where: { user: { email: 'user@example.com' }, revoked: false } });

      expect(activeTokens).toHaveLength(0);
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/2fa/disable')
          .send({ email: 'combined@example.com', password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'combined@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/2fa/disable')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/2fa/disable')
          .send({ email: `origin-${i}@example.com`, password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'origin-final@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
