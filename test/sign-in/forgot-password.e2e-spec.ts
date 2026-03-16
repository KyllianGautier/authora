import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../src/entity/one-time-token.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { hashVerify } from '../utils/hash';

// Requests a password reset: creates a one-time token and sends a reset email.
// Always returns 200 with a neutral message to prevent email enumeration.
describe('POST /sign-in/forgot-password', () => {
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
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });
  });

  describe('behavior', () => {
    it('should return 200 with neutral message when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .send({ email: 'unknown@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the account exists, the password reset email will be sent'
      );

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(0);
    });

    it('should return 200, create a forgot password token and send reset email', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the account exists, the password reset email will be sent'
      );

      // A one-time forgot password token should be stored (hashed) in the database
      const token = await dataSource
        .getRepository(OneTimeTokenEntity)
        .findOne({
          where: {
            user: { email: 'user@example.com' },
            type: OneTimeTokenType.ForgotPassword
          }
        });

      expect(token).not.toBeNull();
      expect(token!.revoked).toBe(false);

      // Verify the clear token in the queue message matches the hashed token in DB
      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('forgot-password');
      expect(messages[0].data.email).toBe('user@example.com');
      await expect(
        hashVerify(token!.tokenHash, messages[0].data.token as string)
      ).resolves.toBe(true);

      const link = messages[0].data.authoraUiForgotPasswordLink as string;

      expect(link).toContain('/ui/en/forgot-password/verify');
      expect(link).toContain('email=user%40example.com');
      expect(link).toContain('token=');
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .send({ email: 'User@Example.COM' })
        .expect(200);

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
          .post('/api/v1/sign-in/forgot-password')
          .send({ email: 'combined@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .send({ email: 'combined@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/forgot-password')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/forgot-password')
          .send({ email: `origin-${i}@example.com` });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password')
        .send({ email: 'origin-final@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
