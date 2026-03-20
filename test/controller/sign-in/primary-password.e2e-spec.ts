import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { getAuthSession } from '../utils/get-auth-session';

// Authenticates with email and password within an existing auth session.
describe('POST /auth/sign-in/primary/password', () => {
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
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'some-id', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'some-id', email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'some-id', email: 'user@example.com', password: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string',
        'email must be an email',
        'password should not be empty',
        'password must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'non-existent', email: 'user@example.com', password: 'password123' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 401 when user does not exist', async () => {
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'unknown@example.com', password: 'password123' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Session should still exist unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(false);
      expect(redisSession!.userId).toBeUndefined();
    });

    it('should return 401 when password is wrong', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'wrongPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Session should still exist unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(false);
      expect(redisSession!.userId).toBeUndefined();
    });

    it('should return 200 with nextStep complete after valid password', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.sessionId).toBe(session.id);
      expect(response.body.nextStep).toBe('complete');

      // Verify the session is updated in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.userId).toBe(user.id);
      expect(redisSession!.primaryAuthVerified).toBe(true);
      expect(redisSession!.rememberMe).toBe(false);
      expect(redisSession!.mfaSetup).toBe(false);
    });

    it('should store rememberMe in the session', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123', rememberMe: true })
        .expect(200);

      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession!.rememberMe).toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'User@Example.COM', password: 'password123' })
        .expect(200);

      expect(response.body.nextStep).toBe('complete');
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .send({ sessionId: 'fake-id', email: 'combined@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'fake-id', email: 'combined@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ sessionId: 'fake-id', email: 'identity@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ sessionId: 'fake-id', email: 'identity@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .send({ sessionId: 'fake-id', email: `origin-${i}@example.com`, password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'fake-id', email: 'origin-final@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
