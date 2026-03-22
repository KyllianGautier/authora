import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { getAuthSession } from '../utils/get-auth-session';

// Requests a magic link email within an existing auth session.
describe('POST /auth/sign-in/primary/magic-link', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 60_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when sessionId is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ sessionId: 'some-id' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string',
        'email must be an email'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ sessionId: 'non-existent', email: 'user@example.com' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 202 and send email when user exists', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ sessionId: session.id, email: 'user@example.com' })
        .expect(202);

      expect(response.body.message).toBe(
        'If the account exists, the magic link will be sent via email'
      );

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('magic-link');
      expect(messages[0].data.email).toBe('user@example.com');
      expect(messages[0].data.token).toBeDefined();

      // Verify the session is updated in Redis with userId (not yet verified)
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.userId).toBe(user.id);
      expect(redisSession!.primaryAuthVerified).toBe(false);
      expect(redisSession!.exchanged).toBe(false);
    });

    it('should return 202 without sending email when user does not exist', async () => {
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ sessionId: session.id, email: 'unknown@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(0);

      // Session should remain unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.userId).toBeUndefined();
      expect(redisSession!.primaryAuthVerified).toBe(false);
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ sessionId: session.id, email: 'User@Example.COM' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.email).toBe('user@example.com');
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/magic-link')
          .send({ sessionId: 'fake-id', email: 'combined@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ sessionId: 'fake-id', email: 'combined@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/magic-link')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ sessionId: 'fake-id', email: 'identity@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ sessionId: 'fake-id', email: 'identity@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/magic-link')
          .send({ sessionId: 'fake-id', email: `origin-${i}@example.com` });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/magic-link')
        .send({ sessionId: 'fake-id', email: 'origin-final@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
