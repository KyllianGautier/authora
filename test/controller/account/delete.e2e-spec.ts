import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';
import { consumeEmailQueue, getTestApp, resetTestState, setTenantConfig } from '../../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { expirePassword } from '../utils/expire-password';
import { getOneTimeToken } from '../utils/get-one-time-token';

// Requests account deletion: verifies credentials, creates a one-time deletion token,
// and sends a verification email via the queue. The actual deletion happens on /account/delete/validate.
describe('POST /account/delete', () => {
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
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'user@example.com', password: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
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
        .post('/api/v1/account/delete')
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
        .post('/api/v1/account/delete')
        .send({ email: 'user@example.com', password: 'wrongPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200, create a deletion token and send verification email', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      // A one-time deletion token should be stored in Redis
      const ott = await getOneTimeToken(app, user.id, OneTimeTokenType.AccountDeletion);

      expect(ott).not.toBeNull();

      // Verify the email queue message
      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('account-deletion-verification');
      expect(messages[0].data.email).toBe('user@example.com');
      expect(messages[0].data.token).toBeDefined();
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'User@Example.COM', password: 'password123' })
        .expect(200);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.email).toBe('user@example.com');
    });

    it('should allow account deletion even when password is expired', async () => {
      setTenantConfig({ passwordExpirationEnabled: true, passwordMaxAgeSec: 60 });
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      await expirePassword(dataSource, user);

      await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('account-deletion-verification');
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/delete')
          .send({ email: 'combined@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'combined@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/delete')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/delete')
          .send({ email: `origin-${i}@example.com`, password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/delete')
        .send({ email: 'origin-final@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
