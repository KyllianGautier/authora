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
import { extractCookie } from '../controller/utils/extract-cookie';

const SIGN_IN_BASE = '/api/v1/auth/sign-in';
const PASSWORD_BASE = '/api/v1/account/password';

/** Helper: full sign-in flow (create → password → exchange → token). */
async function signIn(
  app: INestApplication<App>,
  email: string,
  password: string
): Promise<{ accessToken: string; refreshTokenCookie: string }> {
  const createRes = await request(app.getHttpServer())
    .post(SIGN_IN_BASE)
    .expect(201);

  await request(app.getHttpServer())
    .post(`${SIGN_IN_BASE}/primary/password`)
    .send({ sessionId: createRes.body.sessionId, email, password })
    .expect(200);

  const exchangeRes = await request(app.getHttpServer())
    .post(`${SIGN_IN_BASE}/exchange`)
    .send({ sessionId: createRes.body.sessionId })
    .expect(200);

  const tokenRes = await request(app.getHttpServer())
    .post(`${SIGN_IN_BASE}/token`)
    .send({ exchangeToken: exchangeRes.body.exchangeToken })
    .expect(200);

  const cookie = extractCookie(tokenRes, 'refreshToken');

  return {
    accessToken: tokenRes.body.accessToken,
    refreshTokenCookie: cookie!.value
  };
}

describe('Scenario: Change password workflows', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 20_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  // ──────────────────────────────────────────────────
  // Happy path
  // ──────────────────────────────────────────────────

  describe('change password → sign in with new password', () => {
    it('should allow sign-in with the new password after change', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'OldP@ssw0rd!');

      await request(app.getHttpServer())
        .post(`${PASSWORD_BASE}/change`)
        .send({
          email: 'user@example.com',
          currentPassword: 'OldP@ssw0rd!',
          newPassword: 'N3wP@ssw0rd!'
        })
        .expect(200);

      // Sign-in with new password should succeed
      const createRes = await request(app.getHttpServer())
        .post(SIGN_IN_BASE)
        .expect(201);

      const authRes = await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/primary/password`)
        .send({ sessionId: createRes.body.sessionId, email: 'user@example.com', password: 'N3wP@ssw0rd!' })
        .expect(200);

      expect(authRes.body.nextStep).toBe('complete');
    });
  });

  // ──────────────────────────────────────────────────
  // Security
  // ──────────────────────────────────────────────────

  describe('old password rejected after change', () => {
    it('should reject sign-in with the old password', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'OldP@ssw0rd!');

      await request(app.getHttpServer())
        .post(`${PASSWORD_BASE}/change`)
        .send({
          email: 'user@example.com',
          currentPassword: 'OldP@ssw0rd!',
          newPassword: 'N3wP@ssw0rd!'
        })
        .expect(200);

      const createRes = await request(app.getHttpServer())
        .post(SIGN_IN_BASE)
        .expect(201);

      const authRes = await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/primary/password`)
        .send({ sessionId: createRes.body.sessionId, email: 'user@example.com', password: 'OldP@ssw0rd!' })
        .expect(401);

      expect(authRes.body.message).toBe('Invalid credentials');
    });
  });

  describe('session invalidation after change', () => {
    it('should invalidate existing refresh tokens after password change', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'OldP@ssw0rd!');

      // Sign in to get tokens
      const { accessToken, refreshTokenCookie } = await signIn(
        app,
        'user@example.com',
        'OldP@ssw0rd!'
      );

      // Change the password
      await request(app.getHttpServer())
        .post(`${PASSWORD_BASE}/change`)
        .send({
          email: 'user@example.com',
          currentPassword: 'OldP@ssw0rd!',
          newPassword: 'N3wP@ssw0rd!'
        })
        .expect(200);

      // Refreshing the old token should fail
      const refreshRes = await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/token/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshTokenCookie}`)
        .expect(401);

      expect(refreshRes.body.message).toBe('Invalid or expired refresh token');
    });
  });

  describe('consecutive password changes', () => {
    it('should only allow sign-in with the latest password', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'P@ssw0rd1!');

      await request(app.getHttpServer())
        .post(`${PASSWORD_BASE}/change`)
        .send({
          email: 'user@example.com',
          currentPassword: 'P@ssw0rd1!',
          newPassword: 'P@ssw0rd2!'
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${PASSWORD_BASE}/change`)
        .send({
          email: 'user@example.com',
          currentPassword: 'P@ssw0rd2!',
          newPassword: 'P@ssw0rd3!'
        })
        .expect(200);

      // Only the latest password works
      const createRes = await request(app.getHttpServer())
        .post(SIGN_IN_BASE)
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'P@ssw0rd1!' })
        .expect(401);

      const session2 = await request(app.getHttpServer())
        .post(SIGN_IN_BASE)
        .expect(201);

      await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/primary/password`)
        .send({ sessionId: session2.body.sessionId, email: 'user@example.com', password: 'P@ssw0rd2!' })
        .expect(401);

      const session3 = await request(app.getHttpServer())
        .post(SIGN_IN_BASE)
        .expect(201);

      const authRes = await request(app.getHttpServer())
        .post(`${SIGN_IN_BASE}/primary/password`)
        .send({ sessionId: session3.body.sessionId, email: 'user@example.com', password: 'P@ssw0rd3!' })
        .expect(200);

      expect(authRes.body.nextStep).toBe('complete');
    });
  });
});
