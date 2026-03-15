import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../src/entity/one-time-token.entity';
import { PasswordEntity } from '../../src/entity/password.entity';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import { TwoFactorAuthEntity } from '../../src/entity/two-factor-auth.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../setup';
import {
  createOneTimeToken,
  FAKE_ONE_TIME_TOKEN
} from '../utils/create-one-time-token';
import { createRefreshToken } from '../utils/create-refresh-token';
import { createTwoFactorAuth } from '../utils/create-two-factor-auth';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { getExpiredDate } from '../utils/date';

// Confirms account deletion using the one-time token from the verification email.
// Deletes the user and all related data (passwords, refresh tokens, 2FA, one-time tokens).
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
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ token: 'some-token' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'not-an-email', token: 'some-token' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'token should not be empty',
        'token must be a string'
      ]);
    });

    it('should return 400 when token is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: '' })
        .expect(400);

      expect(response.body.message).toEqual(['token should not be empty']);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
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
    it('should return 404 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'unknown@example.com', token: 'some-token' })
        .expect(404);

      expect(response.body.message).toBe(
        "No pending account deletion found for email 'unknown@example.com'"
      );
    });

    it('should return 401 when no deletion token exists', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: 'some-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 401 when token is invalid', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.AccountDeletion
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: 'wrong-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    // Even with the correct token, an expired deletion token must be rejected
    it('should return 401 when deletion token is expired', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.AccountDeletion,
        { expiredAt: getExpiredDate() }
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 200 and delete the user and all related data', async () => {
      // Set up a user with every possible type of related data
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createRefreshToken(dataSource, user);
      await createTwoFactorAuth(dataSource, user, true);
      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.AccountDeletion
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN })
        .expect(200);

      // Verify the user and all related entities have been cascade-deleted
      const deletedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });

      expect(deletedUser).toBeNull();

      const passwords = await dataSource
        .getRepository(PasswordEntity)
        .find({ where: { user: { id: user.id } } });

      expect(passwords).toHaveLength(0);

      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(refreshTokens).toHaveLength(0);

      const twoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOneBy({ user: { id: user.id } });

      expect(twoFactorAuth).toBeNull();

      const oneTimeTokens = await dataSource
        .getRepository(OneTimeTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(oneTimeTokens).toHaveLength(0);
    });

    it('should normalize email to lowercase', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.AccountDeletion
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'User@Example.COM', token: FAKE_ONE_TIME_TOKEN })
        .expect(200);

      const deletedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });

      expect(deletedUser).toBeNull();
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/delete-account/verify')
          .send({ email: 'combined@example.com', token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'combined@example.com', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/delete-account/verify')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/delete-account/verify')
          .send({ email: `origin-${i}@example.com`, token: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/delete-account/verify')
        .send({ email: 'origin-final@example.com', token: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
