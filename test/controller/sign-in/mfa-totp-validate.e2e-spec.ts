import { INestApplication } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { createTwoFactorAuth } from '../utils/create-two-factor-auth';
import { getAuthSession } from '../utils/get-auth-session';

// Validates a TOTP code for MFA within an existing auth session.
// Requires primary auth to be completed first.
describe('POST /auth/sign-in/mfa/totp/validate', () => {
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

  describe('validation', () => {
    it('should return 400 when sessionId is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when code is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'some-id' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be longer than or equal to 6 characters',
        'code should not be empty',
        'code must be a string'
      ]);
    });

    it('should return 400 when code is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'some-id', code: '123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be longer than or equal to 6 characters'
      ]);
    });

    it('should return 400 when code is too long', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'some-id', code: '1234567' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be shorter than or equal to 6 characters'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string',
        'code must be longer than or equal to 6 characters',
        'code should not be empty',
        'code must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'non-existent', code: '123456' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 401 when primary auth is not completed', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, { userId: user.id });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code: '123456' })
        .expect(401);

      expect(response.body.message).toBe('Primary authentication required');

      // Session should remain unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.mfaVerified).toBe(false);
    });

    it('should return 401 when TOTP code is invalid', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTwoFactorAuth(dataSource, user, true);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code: '000000' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Session should remain unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.mfaVerified).toBe(false);
    });

    it('should return 200 with nextStep complete after valid TOTP code', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code })
        .expect(200);

      expect(response.body.sessionId).toBe(session.id);
      expect(response.body.nextStep).toBe('complete');

      // Verify the session is updated in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.mfaVerified).toBe(true);
    });
  });

  // Three-dimensional rate limiting.
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/mfa/totp/validate')
          .send({ sessionId: 'fake-id', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'fake-id', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/mfa/totp/validate')
          .send({ sessionId: `fake-id-${i}`, code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'fake-id-final', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
