import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RegistrationEntity } from '../../src/entity/registration.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../setup';
import { createRegistration } from '../utils/create-registration';
import { createUser } from '../utils/create-user';
import { hashVerify } from '../utils/hash';

// Creates a pending registration with hashed password and sends a verification email via the queue.
describe('POST /sign-up', () => {
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
        .post('/sign-up')
        .send({ password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string',
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'user@example.com', password: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 400 when password is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'user@example.com', password: 'short' })
        .expect(400);

      expect(response.body.message).toEqual([
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'email must be an email',
        'password should not be empty',
        'password must be a string',
        'Password must contain at least 8 characters'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 201, create a registration and send a verification email', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'new@example.com', password: 'password123' })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          email: 'new@example.com',
          createdAt: expect.any(String)
        })
      );

      // Verify the registration was persisted with the password hashed (not stored in clear)
      const registration = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'new@example.com' });

      expect(registration).not.toBeNull();
      await expect(
        hashVerify(registration!.passwordHash, 'password123')
      ).resolves.toBe(true);
      expect(registration!.emailVerificationTokenExpiresAt).toBeDefined();

      // Verify the verification email was published to the queue
      // and that the clear token in the message matches the hashed token stored in DB
      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('sign-up-verification');
      expect(messages[0].data.email).toBe('new@example.com');
      await expect(
        hashVerify(
          registration!.emailVerificationTokenHash,
          messages[0].data.token as string
        )
      ).resolves.toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'Upper@Example.COM', password: 'password123' })
        .expect(201);

      expect(response.body.email).toBe('upper@example.com');

      const registration = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'upper@example.com' });

      expect(registration).not.toBeNull();
    });

    it('should return 409 when email is already used in registration', async () => {
      await createRegistration(
        dataSource,
        'duplicate@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'duplicate@example.com', password: 'password456' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'duplicate@example.com' is already used"
      );
    });

    it('should return 409 when email is already used by a user', async () => {
      await createUser(dataSource, 'existing@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'existing@example.com', password: 'password123' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'existing@example.com' is already used"
      );
    });

    it('should return 409 when email differs only by case in registration', async () => {
      await createRegistration(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'User@Example.COM', password: 'password456' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'user@example.com' is already used"
      );
    });

    it('should return 409 when email differs only by case in user', async () => {
      await createUser(dataSource, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'User@Example.COM', password: 'password123' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'user@example.com' is already used"
      );
    });

  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/sign-up')
          .send({ email: 'combined@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'combined@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    // Same email from different IPs (simulated via X-Forwarded-For)
    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/sign-up')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    // Same IP with different emails (default IP since no X-Forwarded-For)
    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/sign-up')
          .send({ email: `origin-${i}@example.com`, password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'origin-final@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
