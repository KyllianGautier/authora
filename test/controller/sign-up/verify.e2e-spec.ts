import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { PasswordEntity } from '../../../src/entity/password.entity';
import { RegistrationEntity } from '../../../src/entity/registration.entity';
import { UserEntity } from '../../../src/entity/user.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../../setup';
import {
  createRegistration,
  FAKE_VERIFICATION_TOKEN
} from '../utils/create-registration';
import { getExpiredDate } from '../utils/date';
import { hashVerify } from '../utils/hash';

// Verifies the email token from registration, creates the user with its password, and deletes the registration.
describe('POST /sign-up/verify', () => {
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
        .post('/api/v1/sign-up/verify')
        .send({ token: 'some-token' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'not-an-email', token: 'some-token' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'token should not be empty',
        'token must be a string'
      ]);
    });

    it('should return 400 when token is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'user@example.com', token: '' })
        .expect(400);

      expect(response.body.message).toEqual(['token should not be empty']);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'email must be an email',
        'token should not be empty',
        'token must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when no registration exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'unknown@example.com', token: 'some-token' })
        .expect(404);

      expect(response.body.message).toBe(
        "No pending sign-up found for email 'unknown@example.com'"
      );
    });

    it('should return 401 when token is invalid', async () => {
      await createRegistration(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'user@example.com', token: 'wrong-token' })
        .expect(401);

      expect(response.body.message).toBe(
        'Invalid token'
      );
    });

    // Even with the correct token, an expired registration must be rejected
    it('should return 401 when verification token is expired', async () => {
      await createRegistration(
        dataSource,
        'user@example.com',
        'password123',
        { tokenExpiresAt: getExpiredDate() }
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'user@example.com', token: FAKE_VERIFICATION_TOKEN })
        .expect(401);

      expect(response.body.message).toBe(
        'Invalid token'
      );
    });

    it('should return 200, create a user with password and delete the registration', async () => {
      await createRegistration(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'user@example.com', token: FAKE_VERIFICATION_TOKEN })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          email: 'user@example.com',
          createdAt: expect.any(String)
        })
      );

      // Registration should be cleaned up after successful verification
      const registration = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'user@example.com' });

      expect(registration).toBeNull();

      // A user and its active password should have been created from the registration data
      const user = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });

      expect(user).not.toBeNull();

      const password = await dataSource
        .getRepository(PasswordEntity)
        .findOneBy({ user: { id: user!.id } });

      expect(password).not.toBeNull();
      expect(password!.revoked).toBe(false);
      await expect(
        hashVerify(password!.passwordHash, 'password123')
      ).resolves.toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      await createRegistration(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'User@Example.COM', token: FAKE_VERIFICATION_TOKEN })
        .expect(200);

      expect(response.body.email).toBe('user@example.com');
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/verify')
          .send({ email: 'combined@example.com', token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'combined@example.com', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/verify')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/verify')
          .send({ email: `origin-${i}@example.com`, token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/verify')
        .send({ email: 'origin-final@example.com', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
