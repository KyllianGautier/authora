import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { getAuthSession } from '../utils/get-auth-session';

// Exchanges a completed auth session for a one-time exchange token.
// The session is consumed (deleted from Redis) after exchange.
describe('POST /auth/sign-in/exchange', () => {
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
        .post('/api/v1/auth/sign-in/exchange')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when sessionId is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: 'non-existent' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 401 when primary auth is not completed', async () => {
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: session.id })
        .expect(401);

      expect(response.body.message).toBe('Primary authentication required');

      // Session should still exist in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
    });

    it('should return 401 when no userId is set on the session', async () => {
      const session = await createAuthSession(app, { primaryAuthVerified: true });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: session.id })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 with exchangeToken after complete auth', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: session.id })
        .expect(200);

      expect(response.body.exchangeToken).toBeDefined();
      expect(typeof response.body.exchangeToken).toBe('string');
      expect(response.body.exchangeToken.length).toBeGreaterThan(0);

      // Verify the session is deleted from Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).toBeNull();
    });

    it('should consume the session after exchange', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: session.id })
        .expect(200);

      // Verify deleted from Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).toBeNull();

      // Second exchange fails
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: session.id })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });
  });

  // Three-dimensional rate limiting.
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/exchange')
          .send({ sessionId: 'fake-id' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: 'fake-id' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/exchange')
          .send({ sessionId: `fake-id-${i}` });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange')
        .send({ sessionId: 'fake-id-final' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
