import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OneTimeTokenEntity, OneTimeTokenType } from '../../../src/entity/one-time-token.entity';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp
} from '../../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';

describe('POST /sign-in/magic-link', () => {
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
    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({})
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('should return 400 when redirectTo is not a valid URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com', redirectTo: 'not-a-url' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('redirectTo')
        ])
      );
    });

    it('should return 400 when locale is not a valid locale', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com', locale: '!!invalid!!' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('locale')
        ])
      );
    });
  });

  describe('behavior', () => {
    it('should return 202 when user exists', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com' })
        .expect(202);

      expect(response.body.message).toBe(
        'If the account exists, the magic link will be sent via email'
      );
    });

    it('should return 202 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'unknown@example.com' })
        .expect(202);

      expect(response.body.message).toBe(
        'If the account exists, the magic link will be sent via email'
      );
    });

    it('should send a magic-link email when user exists', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        pattern: 'magic-link',
        data: {
          email: 'user@example.com',
          token: expect.any(String),
          authoraUiMagicLink: expect.any(String)
        }
      });
    });

    it('should not send an email when user does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'unknown@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(0);
    });

    it('should create a one-time token in the database', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com' })
        .expect(202);

      const tokens = await dataSource
        .getRepository(OneTimeTokenEntity)
        .find({ where: { user: { id: user.id }, type: OneTimeTokenType.MagicLink } });

      expect(tokens).toHaveLength(1);
      expect(tokens[0].revoked).toBe(false);
    });

    it('should replace previous magic-link token on new request', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com' })
        .expect(202);

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com' })
        .expect(202);

      const tokens = await dataSource
        .getRepository(OneTimeTokenEntity)
        .find({ where: { user: { id: user.id }, type: OneTimeTokenType.MagicLink } });

      expect(tokens).toHaveLength(1);
    });

    it('should include redirectTo in magic-link URL when provided', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com', redirectTo: 'https://myapp.com/dashboard' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.authoraUiMagicLink).toContain(
        'redirectTo=' + encodeURIComponent('https://myapp.com/dashboard')
      );
    });

    it('should include locale in magic-link URL path when provided', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com', locale: 'fr' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.authoraUiMagicLink).toContain(
        '/ui/fr/sign-in/magic-link/validate'
      );
    });

    it('should default locale to en in magic-link URL path when not provided', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.authoraUiMagicLink).toContain(
        '/ui/en/sign-in/magic-link/validate'
      );
    });

    it('should not include redirectTo in magic-link URL when not provided', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.authoraUiMagicLink).not.toContain('redirectTo');
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'User@Example.COM' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.email).toBe('user@example.com');
    });
  });

  describe('throttling', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/magic-link')
          .send({ email: 'throttle@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/magic-link')
        .send({ email: 'throttle@example.com' });

      expect(response.status).toBe(429);
    });
  });
});
