import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp
} from '../setup';
import { createUserWithPassword } from '../controller/utils/create-user-with-password';

const BASE = '/api/v1/account/password';
const SIGN_IN_BASE = '/api/v1/auth/sign-in';

describe('Scenario: Forgot password workflows', () => {
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

  // ──────────────────────────────────────────────────
  // Happy paths
  // ──────────────────────────────────────────────────

  describe('forgot password → verify → sign in with new password', () => {
    it('should complete the full forgot password workflow', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'OldP@ssw0rd!');

      // Step 1: Request forgot password
      const forgotRes = await request(app.getHttpServer())
        .post(`${BASE}/forgot`)
        .send({ email: 'user@example.com' })
        .expect(202);

      expect(forgotRes.body.message).toBe(
        'If the account exists, the reset email will be sent'
      );

      // Step 2: Extract token from email queue
      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('forgot-password');
      const token = messages[0].data.token as string;

      // Step 3: Verify with the token and set new password
      const verifyRes = await request(app.getHttpServer())
        .post(`${BASE}/reset`)
        .send({ email: 'user@example.com', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      expect(verifyRes.body.message).toBe('Password reset successfully');

      // Step 4: Sign in with the new password via sign-in flow
      const createSessionRes = await request(app.getHttpServer())
        .post(SIGN_IN_BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createSessionRes.body.sessionId;

      // Old password should fail
      const oldPasswordRes = await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'OldP@ssw0rd!' })
        .expect(401);

      expect(oldPasswordRes.body.message).toBe('Invalid credentials');

      // New password should succeed
      const authRes = await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'N3wP@ssw0rd!' })
        .expect(200);

      expect(authRes.body.nextStep).toBe('complete');
    });
  });

  // ──────────────────────────────────────────────────
  // Edge cases
  // ──────────────────────────────────────────────────

  describe('email normalization', () => {
    it('should accept mixed-case email in both forgot and verify', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'OldP@ssw0rd!');

      await request(app.getHttpServer())
        .post(`${BASE}/forgot`)
        .send({ email: 'User@Example.COM' })
        .expect(202);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      const token = messages[0].data.token as string;

      const verifyRes = await request(app.getHttpServer())
        .post(`${BASE}/reset`)
        .send({ email: 'USER@EXAMPLE.COM', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      expect(verifyRes.body.message).toBe('Password reset successfully');
    });
  });

  describe('token reuse prevention', () => {
    it('should not allow reuse of the forgot-password token', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'OldP@ssw0rd!');

      await request(app.getHttpServer())
        .post(`${BASE}/forgot`)
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post(`${BASE}/reset`)
        .send({ email: 'user@example.com', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      // Second use should fail
      const response = await request(app.getHttpServer())
        .post(`${BASE}/reset`)
        .send({ email: 'user@example.com', token, newPassword: 'An0th3rP@ss!' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });
  });

  describe('non-existent user', () => {
    it('should return 202 for forgot but 401 for reset with unknown email', async () => {
      // Forgot should succeed silently (no enumeration)
      const forgotRes = await request(app.getHttpServer())
        .post(`${BASE}/forgot`)
        .send({ email: 'unknown@example.com' })
        .expect(202);

      expect(forgotRes.body.message).toBe(
        'If the account exists, the reset email will be sent'
      );

      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(0);

      // Verify should fail
      const verifyRes = await request(app.getHttpServer())
        .post(`${BASE}/reset`)
        .send({ email: 'unknown@example.com', token: 'some-token', newPassword: 'N3wP@ssw0rd!' })
        .expect(401);

      expect(verifyRes.body.message).toBe('Invalid credentials');
    });
  });

  describe('password reuse prevention', () => {
    it('should reject new password that matches the current one', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'OldP@ssw0rd!');

      await request(app.getHttpServer())
        .post(`${BASE}/forgot`)
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      const response = await request(app.getHttpServer())
        .post(`${BASE}/reset`)
        .send({ email: 'user@example.com', token, newPassword: 'OldP@ssw0rd!' })
        .expect(400);

      expect(response.body.message).toBe('New password has already been used');
    });
  });
});
