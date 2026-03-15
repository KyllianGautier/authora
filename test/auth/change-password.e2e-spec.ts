import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OneTimeTokenEntity, OneTimeTokenType } from '../../src/entity/one-time-token.entity';
import { PasswordEntity } from '../../src/entity/password.entity';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import { createOneTimeToken } from '../utils/create-one-time-token';
import { createPassword } from '../utils/create-password';
import { createRefreshToken } from '../utils/create-refresh-token';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { consumeEmailQueue, getTestApp, resetTestState } from '../setup';
import { hashVerify } from '../utils/hash';

// Changes the user's password after verifying current credentials.
// Revokes the old password, creates a new one, and invalidates all refresh tokens and one-time tokens.
describe('POST /auth/change-password', () => {
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
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'oldPass123', newPassword: 'newPass123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'not-an-email',
          currentPassword: 'oldPass123',
          newPassword: 'newPass123'
        })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when currentPassword is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ email: 'user@example.com', newPassword: 'newPass123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'currentPassword should not be empty',
        'currentPassword must be a string'
      ]);
    });

    it('should return 400 when currentPassword is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: '',
          newPassword: 'newPass123'
        })
        .expect(400);

      expect(response.body.message).toEqual([
        'currentPassword should not be empty'
      ]);
    });

    it('should return 400 when newPassword is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ email: 'user@example.com', currentPassword: 'oldPass123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'newPassword should not be empty',
        'newPassword must be a string',
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 400 when newPassword is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPass123',
          newPassword: ''
        })
        .expect(400);

      expect(response.body.message).toEqual([
        'newPassword should not be empty',
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 400 when newPassword is the same as currentPassword', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'samePassword',
          newPassword: 'samePassword'
        })
        .expect(400);

      expect(response.body.message).toEqual([
        'New password must be different from current password'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'email must be an email',
        'currentPassword should not be empty',
        'currentPassword must be a string',
        'New password must be different from current password',
        'newPassword should not be empty',
        'newPassword must be a string',
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 400 when newPassword is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'short'
        })
        .expect(400);

      expect(response.body.message).toEqual([
        'Password must contain at least 8 characters'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'unknown@example.com',
          currentPassword: 'oldPass123',
          newPassword: 'newPass123'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when current password is wrong', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'correctPassword');

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'wrongPassword',
          newPassword: 'newPass123'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 and change the password', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);

      expect(response.body).toEqual({});

      // Old password should be revoked (kept for reuse prevention), new one active
      const passwords = await dataSource.getRepository(PasswordEntity).find({
        where: { user: { email: 'user@example.com' } },
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
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'currentPassword');

      await createPassword(dataSource, user, 'previousPassword', true);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'currentPassword',
          newPassword: 'previousPassword'
        })
        .expect(400);

      expect(response.body.message).toBe('New password has already been used');
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'User@Example.COM',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);

      expect(response.body).toEqual({});
    });

    // Changing password is a security-sensitive action: all sessions must be invalidated
    it('should revoke all refresh tokens after password change', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      await createRefreshToken(dataSource, user);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);

      expect(response.body).toEqual({});

      const activeTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { email: 'user@example.com' }, revoked: false } });

      expect(activeTokens).toHaveLength(0);
    });

    // Pending one-time tokens (e.g., account deletion) must also be invalidated
    it('should revoke all one-time tokens after password change', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      await createOneTimeToken(dataSource, user, OneTimeTokenType.AccountDeletion);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);

      expect(response.body).toEqual({});

      const activeTokens = await dataSource
        .getRepository(OneTimeTokenEntity)
        .find({ where: { user: { email: 'user@example.com' }, revoked: false } });

      expect(activeTokens).toHaveLength(0);
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/change-password')
          .send({ email: 'combined@example.com', currentPassword: 'oldPass123', newPassword: 'newPass123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ email: 'combined@example.com', currentPassword: 'oldPass123', newPassword: 'newPass123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/change-password')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', currentPassword: 'oldPass123', newPassword: 'newPass123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', currentPassword: 'oldPass123', newPassword: 'newPass123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/change-password')
          .send({ email: `origin-${i}@example.com`, currentPassword: 'oldPass123', newPassword: 'newPass123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ email: 'origin-final@example.com', currentPassword: 'oldPass123', newPassword: 'newPass123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
