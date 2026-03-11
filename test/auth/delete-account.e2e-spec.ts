import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../src/entity/one-time-token.entity';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { clearDatabase, consumeEmailQueue, getTestApp } from '../setup';

describe('POST /auth/delete-account', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 120_000);

  beforeEach(async () => {
    await clearDatabase();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com' })
        .expect(400);
    });

    it('should return 400 when password is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: '' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'unknown@example.com', password: 'password123' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when password is wrong', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'correctPassword');

      const response = await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'wrongPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 and create an account deletion token', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const token = await dataSource.getRepository(OneTimeTokenEntity).findOne({
        where: {
          user: { email: 'user@example.com' },
          type: OneTimeTokenType.AccountDeletion
        }
      });

      expect(token).not.toBeNull();
      expect(token!.revoked).toBe(false);
    });

    it('should send a verification email to the queue', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        pattern: 'account-deletion-verification',
        data: {
          email: 'user@example.com',
          token: expect.any(String)
        }
      });
    });

    it('should delete previous account deletion token on new request', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const tokens = await dataSource.getRepository(OneTimeTokenEntity).find({
        where: {
          user: { email: 'user@example.com' },
          type: OneTimeTokenType.AccountDeletion
        }
      });

      expect(tokens).toHaveLength(1);
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ email: 'User@Example.COM', password: 'password123' })
        .expect(200);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        pattern: 'account-deletion-verification',
        data: {
          email: 'user@example.com',
          token: expect.any(String)
        }
      });
    });
  });
});
