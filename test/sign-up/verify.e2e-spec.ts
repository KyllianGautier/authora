import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RegistrationEntity } from '../../src/entity/registration.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { PasswordEntity } from '../../src/entity/password.entity';
import { clearDatabase, consumeEmailQueue, getTestApp } from '../setup';

describe('POST /sign-up/verify', () => {
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
        .post('/sign-up/verify')
        .send({ token: 'some-token' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'not-an-email', token: 'some-token' })
        .expect(400);
    });

    it('should return 400 when token is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'user@example.com' })
        .expect(400);
    });

    it('should return 400 when token is empty', () => {
      return request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'user@example.com', token: '' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 404 when no registration exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'unknown@example.com', token: 'some-token' })
        .expect(404);

      expect(response.body.message).toBe(
        "No pending sign-up found for email 'unknown@example.com'"
      );
    });

    it('should return 401 when token is invalid', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'badtoken@example.com', password: 'password123' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'badtoken@example.com', token: 'wrong-token' })
        .expect(401);

      expect(response.body.message).toBe('Email verification token is invalid');
    });

    it('should return 410 when verification token is expired', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'expired@example.com', password: 'password123' })
        .expect(201);

      // Set the token expiration to the past
      await dataSource
        .getRepository(RegistrationEntity)
        .update(
          { email: 'expired@example.com' },
          { emailVerificationTokenExpiresAt: new Date('2000-01-01') }
        );

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      const response = await request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'expired@example.com', token })
        .expect(410);

      expect(response.body.message).toBe(
        'Email verification token has expired'
      );
    });

    it('should create a user and delete the registration on valid token', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'valid@example.com', password: 'password123' })
        .expect(201);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      const response = await request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'valid@example.com', token })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          email: 'valid@example.com',
          createdAt: expect.any(String)
        })
      );

      const registration = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'valid@example.com' });
      expect(registration).toBeNull();

      const user = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'valid@example.com' });
      expect(user).not.toBeNull();

      const password = await dataSource
        .getRepository(PasswordEntity)
        .findOneBy({ user: { id: user!.id } });
      expect(password).not.toBeNull();
      expect(password!.revoked).toBe(false);
    });

    it('should work with resent verification token', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'resent@example.com', password: 'password123' })
        .expect(201);

      // Drain the first sign-up message
      await consumeEmailQueue();

      await request(app.getHttpServer())
        .post('/sign-up/resend-verification-email')
        .send({ email: 'resent@example.com' })
        .expect(200);

      const messages = await consumeEmailQueue();
      const newToken = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'resent@example.com', token: newToken })
        .expect(200);

      const user = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'resent@example.com' });
      expect(user).not.toBeNull();
    });

    it('should complete the full sign-up flow via queue token', async () => {
      // Sign up
      const signUpResponse = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'fullflow@example.com', password: 'password123' })
        .expect(201);

      expect(signUpResponse.body.email).toBe('fullflow@example.com');

      // Consume the verification token from the queue
      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('sign-up-verification');
      const token = messages[0].data.token as string;

      // Verify the email with the token from the queue
      const verifyResponse = await request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'fullflow@example.com', token })
        .expect(200);

      expect(verifyResponse.body.email).toBe('fullflow@example.com');

      // Registration should be deleted
      const registration = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'fullflow@example.com' });
      expect(registration).toBeNull();

      // User and password should exist
      const user = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'fullflow@example.com' });
      expect(user).not.toBeNull();

      const password = await dataSource
        .getRepository(PasswordEntity)
        .findOneBy({ user: { id: user!.id } });
      expect(password).not.toBeNull();
      expect(password!.revoked).toBe(false);

      // The password should match the original sign-up password
      const matches = await bcrypt.compare(
        'password123',
        password!.passwordHash
      );
      expect(matches).toBe(true);
    });

    it('should reject the old token after resend', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'oldtoken@example.com', password: 'password123' })
        .expect(201);

      const firstMessages = await consumeEmailQueue();
      const oldToken = firstMessages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/sign-up/resend-verification-email')
        .send({ email: 'oldtoken@example.com' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/sign-up/verify')
        .send({ email: 'oldtoken@example.com', token: oldToken })
        .expect(401);

      expect(response.body.message).toBe('Email verification token is invalid');
    });
  });
});
