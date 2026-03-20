import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../../src/entity/one-time-token.entity';
import { PasswordEntity } from '../../../src/entity/password.entity';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../../setup';
import {
  createOneTimeToken,
  FAKE_ONE_TIME_TOKEN
} from '../utils/create-one-time-token';
import { createPassword } from '../utils/create-password';
import { createRefreshToken } from '../utils/create-refresh-token';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { getExpiredDate } from '../utils/date';
import { hashVerify } from '../utils/hash';

// Resets the user password using a forgot-password one-time token.
// Revokes the old password, creates a new one, and invalidates all refresh tokens and one-time tokens.
describe('POST /sign-in/forgot-password/verify', () => {
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
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ token: 'some-token', newPassword: 'newPassword' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'not-an-email', token: 'some-token', newPassword: 'newPassword' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', newPassword: 'newPassword' })
        .expect(400);

      expect(response.body.message).toEqual([
        'token should not be empty',
        'token must be a string'
      ]);
    });

    it('should return 400 when token is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: '', newPassword: 'newPassword' })
        .expect(400);

      expect(response.body.message).toEqual(['token should not be empty']);
    });

    it('should return 400 when newPassword is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: 'some-token' })
        .expect(400);

      expect(response.body.message).toEqual([
        'Password must contain at least 8 characters',
        'newPassword should not be empty',
        'newPassword must be a string'
      ]);
    });

    it('should return 400 when newPassword is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: 'some-token', newPassword: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'Password must contain at least 8 characters',
        'newPassword should not be empty'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'email must be an email',
        'token should not be empty',
        'token must be a string',
        'Password must contain at least 8 characters',
        'newPassword should not be empty',
        'newPassword must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'unknown@example.com', token: 'some-token', newPassword: 'newPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when no forgot password token exists', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: 'some-token', newPassword: 'newPassword' })
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
        OneTimeTokenType.ForgotPassword
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: 'wrong-token', newPassword: 'newPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 401 when token is expired', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.ForgotPassword,
        { expiredAt: getExpiredDate() }
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: 'newPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 200 and reset the password', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'oldPassword'
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.ForgotPassword
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: 'newPassword' })
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');

      // Old password should be revoked, new one active
      const passwords = await dataSource.getRepository(PasswordEntity).find({
        where: { user: { id: user.id } },
        order: { createdAt: 'ASC' }
      });

      expect(passwords).toHaveLength(2);
      expect(passwords[0].revoked).toBe(true);
      expect(passwords[1].revoked).toBe(false);

      const newPasswordMatches = await hashVerify(
        passwords[1].passwordHash,
        'newPassword'
      );
      expect(newPasswordMatches).toBe(true);
    });

    // Password reuse prevention: even revoked passwords are checked against the new one
    it('should return 400 when new password was already used', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'currentPassword'
      );

      await createPassword(dataSource, user, 'previousPassword', true);

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.ForgotPassword
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: 'previousPassword' })
        .expect(400);

      expect(response.body.message).toBe('New password has already been used');
    });

    it('should normalize email to lowercase', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'oldPassword'
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.ForgotPassword
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'User@Example.COM', token: FAKE_ONE_TIME_TOKEN, newPassword: 'newPassword' })
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');
    });

    // Password reset is a security-sensitive action: all sessions must be invalidated
    it('should revoke all refresh tokens after password reset', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'oldPassword'
      );

      await createRefreshToken(dataSource, user);

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.ForgotPassword
      );

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: 'newPassword' })
        .expect(200);

      const activeTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(activeTokens).toHaveLength(0);
    });

    // Pending one-time tokens must also be invalidated after password reset
    it('should revoke all one-time tokens after password reset', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'oldPassword'
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.TwoFactorAuthVerify
      );

      await createOneTimeToken(
        dataSource,
        user,
        OneTimeTokenType.ForgotPassword
      );

      await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: 'newPassword' })
        .expect(200);

      const activeTokens = await dataSource
        .getRepository(OneTimeTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(activeTokens).toHaveLength(0);
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/forgot-password/verify')
          .send({ email: 'combined@example.com', token: 'fake-token', newPassword: 'newPassword' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'combined@example.com', token: 'fake-token', newPassword: 'newPassword' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/forgot-password/verify')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', token: 'fake-token', newPassword: 'newPassword' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', token: 'fake-token', newPassword: 'newPassword' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/forgot-password/verify')
          .send({ email: `origin-${i}@example.com`, token: 'fake-token', newPassword: 'newPassword' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/forgot-password/verify')
        .send({ email: 'origin-final@example.com', token: 'fake-token', newPassword: 'newPassword' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
