import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../src/entity/one-time-token.entity';
import { PasswordEntity } from '../../src/entity/password.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { resetTestState, consumeEmailQueue, getTestApp } from '../setup';

describe('POST /auth/delete-account/verify', () => {
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
        .post('/auth/delete-account/verify')
        .send({ token: 'some-token' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'not-an-email', token: 'some-token' })
        .expect(400);
    });

    it('should return 400 when token is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com' })
        .expect(400);
    });

    it('should return 400 when token is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: '' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 404 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'unknown@example.com', token: 'some-token' })
        .expect(404);

      expect(response.body.message).toBe(
        "No pending account deletion found for email 'unknown@example.com'"
      );
    });

    it('should return 404 when no deletion token exists', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: 'some-token' })
        .expect(404);

      expect(response.body.message).toBe('One-time token not found');
    });

    it('should return 401 when token is invalid', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: 'wrong-token' })
        .expect(401);

      expect(response.body.message).toBe('One-time token is invalid');
    });

    it('should return 410 when deletion token is expired', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      // Set the token expiration to the past
      await dataSource
        .getRepository(OneTimeTokenEntity)
        .update(
          { type: OneTimeTokenType.AccountDeletion },
          { expiredAt: new Date('2000-01-01') }
        );

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      const response = await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com', token })
        .expect(410);

      expect(response.body.message).toBe('One-time token has expired');
    });

    it('should delete the user and all related data on valid token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      // Verify the OTT was created before deletion
      const tokenBefore = await dataSource
        .getRepository(OneTimeTokenEntity)
        .findOneBy({ user: { id: user.id } });
      expect(tokenBefore).not.toBeNull();

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com', token })
        .expect(200);

      // User should be deleted
      const deletedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });
      expect(deletedUser).toBeNull();

      // Passwords should be cascade-deleted
      const passwords = await dataSource
        .getRepository(PasswordEntity)
        .find({ where: { user: { id: user.id } } });
      expect(passwords).toHaveLength(0);

      // One-time tokens should be cascade-deleted
      const tokens = await dataSource
        .getRepository(OneTimeTokenEntity)
        .find({ where: { user: { id: user.id } } });
      expect(tokens).toHaveLength(0);
    });

    it('should work with resent deletion token', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      // Drain first deletion message
      await consumeEmailQueue();

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const messages = await consumeEmailQueue();
      const newToken = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: newToken })
        .expect(200);

      const user = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });
      expect(user).toBeNull();
    });

    it('should reject the old token after re-request', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const firstMessages = await consumeEmailQueue();
      const oldToken = firstMessages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: oldToken })
        .expect(401);
    });
  });

  describe('throttling', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/delete-account/verify')
          .send({ email: 'throttle@example.com', token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/auth/delete-account/verify')
        .send({ email: 'throttle@example.com', token: 'fake-token' });

      expect(response.status).toBe(429);
    });
  });
});
