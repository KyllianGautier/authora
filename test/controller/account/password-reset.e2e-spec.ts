import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { LockReason } from '../../../src/entity/user.entity';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';
import { PasswordEntity } from '../../../src/entity/password.entity';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import { UserEntity } from '../../../src/entity/user.entity';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp
} from '../../setup';
import { createOneTimeToken, FAKE_ONE_TIME_TOKEN } from '../utils/create-one-time-token';
import { createRefreshToken } from '../utils/create-refresh-token';
import { createUserWithPassword } from '../utils/create-user-with-password';

const VALID_PASSWORD = 'N3wP@ssw0rd!';

// Verifies the forgot-password token and resets the user's password.
describe('POST /account/password/reset', () => {
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
    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'email must be an email',
          'token should not be empty',
          'token must be a string'
        ])
      );
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'not-an-email', token: 'some-token', newPassword: VALID_PASSWORD })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when token is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: '', newPassword: VALID_PASSWORD })
        .expect(400);

      expect(response.body.message).toEqual(['token should not be empty']);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'unknown@example.com', token: 'some-token', newPassword: VALID_PASSWORD })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when token is invalid', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: 'wrong-token', newPassword: VALID_PASSWORD })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 401 when token is expired', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      // No token created in Redis — equivalent to an expired token (TTL elapsed)
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 200 and reset password with valid token', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');
      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');

      // Verify the old password is revoked and a new one exists
      const passwords = await dataSource
        .getRepository(PasswordEntity)
        .find({ where: { user: { id: user.id } } });

      expect(passwords).toHaveLength(2);
      expect(passwords.filter((p) => p.revoked)).toHaveLength(1);
      expect(passwords.filter((p) => !p.revoked)).toHaveLength(1);
    });

    it('should return 400 when new password was already used', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');
      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: 'P@ssw0rd!' })
        .expect(400);

      expect(response.body.message).toBe('New password has already been used');
    });

    it('should revoke the token after use', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');
      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      // Second use should fail
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: 'An0th3rP@ss!' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should revoke all refresh tokens for the user', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');
      await createRefreshToken(dataSource, user);
      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].revoked).toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');
      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'User@Example.COM', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');
    });
  });

  describe('account unlock', () => {
    it('should unlock the account when locked for TOO_MANY_ATTEMPTS', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      // Lock the user
      await dataSource.getRepository(UserEntity).update(user.id, {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: LockReason.TooManyAttempts
      });

      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      const updatedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(updatedUser!.isLocked).toBe(false);
      expect(updatedUser!.lockedAt).toBeNull();
      expect(updatedUser!.lockReason).toBeNull();
    });

    it('should NOT unlock the account when locked for SUSPICIOUS_ACTIVITY', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      await dataSource.getRepository(UserEntity).update(user.id, {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: LockReason.SuspiciousActivity
      });

      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      const updatedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(updatedUser!.isLocked).toBe(true);
      expect(updatedUser!.lockReason).toBe(LockReason.SuspiciousActivity);
    });

    it('should NOT unlock the account when locked for ADMIN_MANUAL', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');

      await dataSource.getRepository(UserEntity).update(user.id, {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: LockReason.AdminManual
      });

      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      const updatedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(updatedUser!.isLocked).toBe(true);
      expect(updatedUser!.lockReason).toBe(LockReason.AdminManual);
    });

    it('should not change anything when user is not locked', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd!');
      await createOneTimeToken(app, user.id, OneTimeTokenType.ForgotPassword);

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token: FAKE_ONE_TIME_TOKEN, newPassword: VALID_PASSWORD })
        .expect(200);

      const updatedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(updatedUser!.isLocked).toBe(false);
      expect(updatedUser!.lockedAt).toBeNull();
      expect(updatedUser!.lockReason).toBeNull();
    });
  });

  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/password/reset')
          .send({ email: 'combined@example.com', token: 'fake', newPassword: VALID_PASSWORD });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'combined@example.com', token: 'fake', newPassword: VALID_PASSWORD });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/account/password/reset')
          .send({ email: `origin-${i}@example.com`, token: 'fake', newPassword: VALID_PASSWORD });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'origin-final@example.com', token: 'fake', newPassword: VALID_PASSWORD });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
