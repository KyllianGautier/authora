import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';
import { TrustedDeviceEntity } from '../../../src/entity/trusted-device.entity';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createOneTimeToken, FAKE_ONE_TIME_TOKEN } from '../utils/create-one-time-token';
import { createTrustedDevice, FAKE_DEVICE_FINGERPRINT } from '../utils/create-trusted-device';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';
import { getAuthSession } from '../utils/get-auth-session';

// Validates a magic link token via query params and marks primary auth as verified.
describe('GET /auth/sign-in/primary/magic-link/validate', () => {
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
    it('should return 400 when sessionId is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ token: 'some-token' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: 'some-id' })
        .expect(400);

      expect(response.body.message).toEqual([
        'token should not be empty',
        'token must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: 'non-existent', token: 'some-token' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 401 when no userId is set on the session', async () => {
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: session.id, token: 'some-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Session should remain unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(false);
    });

    it('should return 401 when token is invalid', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, { userId: user.id });

      await createOneTimeToken(app, user.id, OneTimeTokenType.MagicLink);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: session.id, token: 'wrong-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');

      // Session should remain unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(false);
    });

    it('should return 200 with nextStep complete after valid token', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, { userId: user.id });

      await createOneTimeToken(app, user.id, OneTimeTokenType.MagicLink);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: session.id, token: FAKE_ONE_TIME_TOKEN })
        .expect(200);

      expect(response.body.sessionId).toBe(session.id);
      expect(response.body.nextStep).toBe('complete');

      // Verify the session is updated in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(true);
      expect(redisSession!.userId).toBe(user.id);
      expect(redisSession!.mfaSetup).toBe(false);
      expect(redisSession!.exchanged).toBe(false);
    });

    it('should create a trusted device and set the cookie', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, { userId: user.id });
      await createOneTimeToken(app, user.id, OneTimeTokenType.MagicLink);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: session.id, token: FAKE_ONE_TIME_TOKEN })
        .expect(200);

      // Verify a TrustedDevice was created
      const devices = await dataSource
        .getRepository(TrustedDeviceEntity)
        .find({ where: { user: { id: user.id } } });

      expect(devices).toHaveLength(1);
      expect(devices[0].trusted).toBe(false);

      // Verify the deviceFingerprint cookie is set
      const cookie = extractCookie(response, 'deviceFingerprint');
      expect(cookie).toBeDefined();
      expect(cookie!.value.length).toBeGreaterThan(0);
    });

    it('should set deviceTrusted when device is trusted', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTrustedDevice(dataSource, user, { trusted: true });
      const session = await createAuthSession(app, { userId: user.id });
      await createOneTimeToken(app, user.id, OneTimeTokenType.MagicLink);

      await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .set('Cookie', `deviceFingerprint=${FAKE_DEVICE_FINGERPRINT}`)
        .query({ sessionId: session.id, token: FAKE_ONE_TIME_TOKEN })
        .expect(200);

      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession!.deviceTrusted).toBe(true);
    });
  });

  // Three-dimensional rate limiting.
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/auth/sign-in/primary/magic-link/validate')
          .query({ sessionId: 'fake-id', token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: 'fake-id', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/auth/sign-in/primary/magic-link/validate')
          .query({ sessionId: `fake-id-${i}`, token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/primary/magic-link/validate')
        .query({ sessionId: 'fake-id-final', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
