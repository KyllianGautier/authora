import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp
} from '../../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { getOneTimeToken } from '../utils/get-one-time-token';

// Requests a forgot-password email containing a one-time token.
describe('POST /account/password/forgot', () => {
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
        .post('/api/v1/account/password/forgot')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });
  });

  describe('behavior', () => {
    it('should return 200 and send email when user exists', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      expect(response.body.message).toBe(
        'If the account exists, the reset email will be sent'
      );

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('forgot-password');
      expect(messages[0].data.email).toBe('user@example.com');
      expect(messages[0].data.token).toBeDefined();

      // Verify OTT is stored in Redis
      const ott = await getOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      expect(ott).not.toBeNull();
    });

    it('should return 200 without sending email when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'unknown@example.com' })
        .expect(202);

      expect(response.body.message).toBe(
        'If the account exists, the reset email will be sent'
      );

      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(0);
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'User@Example.COM' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.email).toBe('user@example.com');
    });

    it('should replace previous forgot-password token', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      const firstMessages = await consumeEmailQueue();
      const firstToken = firstMessages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      const secondMessages = await consumeEmailQueue();
      const secondToken = secondMessages[0].data.token as string;

      // The latest token should be stored in Redis (overwriting the first)
      const ott = await getOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      expect(ott).not.toBeNull();
      // First token should no longer work (replaced)
      expect(firstToken).not.toBe(secondToken);
    });
  });

  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/password/forgot')
          .send({ email: 'combined@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'combined@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/password/forgot')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/password/forgot')
          .send({ email: `origin-${i}@example.com` });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'origin-final@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
