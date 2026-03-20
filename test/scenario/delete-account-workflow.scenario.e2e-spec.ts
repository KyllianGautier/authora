import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../src/entity/user.entity';
import { PasswordEntity } from '../../src/entity/password.entity';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp
} from '../setup';
import { createUserWithPassword } from '../controller/utils/create-user-with-password';
import { createRefreshToken } from '../controller/utils/create-refresh-token';

const BASE = '/api/v1/account';

describe('Scenario: Delete account workflows', () => {
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

  // ──────────────────────────────────────────────────
  // Happy paths
  // ──────────────────────────────────────────────────

  describe('request deletion → validate → verify user is gone', () => {
    it('should complete the full account deletion workflow', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'P@ssw0rd!'
      );

      await createRefreshToken(dataSource, user);

      // Step 1: Request account deletion
      await request(app.getHttpServer())
        .post(`${BASE}/delete`)
        .send({ email: 'user@example.com', password: 'P@ssw0rd!' })
        .expect(200);

      // Step 2: Extract token from email queue
      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('account-deletion-verification');
      const token = messages[0].data.token as string;

      // Step 3: Validate the deletion
      await request(app.getHttpServer())
        .post(`${BASE}/delete/validate`)
        .send({ email: 'user@example.com', token })
        .expect(200);

      // Step 4: Verify the user and all related data are deleted
      const deletedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(deletedUser).toBeNull();

      const passwords = await dataSource
        .getRepository(PasswordEntity)
        .find({ where: { user: { id: user.id } } });

      expect(passwords).toHaveLength(0);

      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(refreshTokens).toHaveLength(0);

    });
  });

  // ──────────────────────────────────────────────────
  // Edge cases
  // ──────────────────────────────────────────────────

  describe('email normalization', () => {
    it('should accept mixed-case email in both delete and validate', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'P@ssw0rd!'
      );

      await request(app.getHttpServer())
        .post(`${BASE}/delete`)
        .send({ email: 'User@Example.COM', password: 'P@ssw0rd!' })
        .expect(200);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      const token = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post(`${BASE}/delete/validate`)
        .send({ email: 'USER@EXAMPLE.COM', token })
        .expect(200);

      const deletedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });

      expect(deletedUser).toBeNull();
    });
  });

  describe('token reuse prevention', () => {
    it('should not allow reuse of the deletion token', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'P@ssw0rd!'
      );

      await request(app.getHttpServer())
        .post(`${BASE}/delete`)
        .send({ email: 'user@example.com', password: 'P@ssw0rd!' })
        .expect(200);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      // First use: deletes the account
      await request(app.getHttpServer())
        .post(`${BASE}/delete/validate`)
        .send({ email: 'user@example.com', token })
        .expect(200);

      // Second use: user no longer exists
      const response = await request(app.getHttpServer())
        .post(`${BASE}/delete/validate`)
        .send({ email: 'user@example.com', token })
        .expect(404);

      expect(response.body.message).toBe(
        "No pending account deletion found for email 'user@example.com'"
      );
    });
  });

  describe('wrong password', () => {
    it('should reject deletion request with wrong password', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'P@ssw0rd!'
      );

      const response = await request(app.getHttpServer())
        .post(`${BASE}/delete`)
        .send({ email: 'user@example.com', password: 'Wr0ngP@ss!' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // No email should be sent
      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(0);

      // User should still exist
      const user = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });

      expect(user).not.toBeNull();
    });
  });

  describe('non-existent user', () => {
    it('should return 401 for delete and 404 for validate with unknown email', async () => {
      const deleteRes = await request(app.getHttpServer())
        .post(`${BASE}/delete`)
        .send({ email: 'unknown@example.com', password: 'P@ssw0rd!' })
        .expect(401);

      expect(deleteRes.body.message).toBe('Invalid credentials');

      const validateRes = await request(app.getHttpServer())
        .post(`${BASE}/delete/validate`)
        .send({ email: 'unknown@example.com', token: 'some-token' })
        .expect(404);

      expect(validateRes.body.message).toBe(
        "No pending account deletion found for email 'unknown@example.com'"
      );
    });
  });
});
