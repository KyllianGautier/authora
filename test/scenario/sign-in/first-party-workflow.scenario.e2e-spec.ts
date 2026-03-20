import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp,
  getTestPublicKey
} from '../../setup';
import { createUserWithPassword } from '../../controller/utils/create-user-with-password';
import { createTwoFactorAuth } from '../../controller/utils/create-two-factor-auth';
import { extractCookie } from '../../controller/utils/extract-cookie';

const BASE = '/api/v1/auth/sign-in-2';

describe('Scenario: First-party sign-in workflows', () => {
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

  describe('password sign-in (no MFA)', () => {
    it('should complete: create → password → exchange → token', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      expect(createRes.body.nextStep).toBe('primaryAuth');
      const sessionId = createRes.body.sessionId;

      const authRes = await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(authRes.body.sessionId).toBe(sessionId);
      expect(authRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      expect(exchangeRes.body.exchangeToken).toBeDefined();

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      // Verify access token
      expect(tokenRes.body.type).toBe('Bearer');
      expect(tokenRes.body.expiresIn).toBe(
        Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS)
      );

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');

      // Verify refresh token cookie
      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
      expect(cookie!.flags).toContain('HttpOnly');
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');
    });
  });

  describe('password sign-in with rememberMe', () => {
    it('should complete full workflow with rememberMe flag', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123', rememberMe: true })
        .expect(200);

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });
  });

  describe('magic-link sign-in (no MFA)', () => {
    it('should complete: create → magic-link → validate → exchange → token', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/magic-link`)
        .send({ sessionId, email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(1);
      const token = messages[0].data.token as string;

      const validateRes = await request(app.getHttpServer())
        .get(`${BASE}/primary/magic-link/validate`)
        .query({ sessionId, token })
        .expect(200);

      expect(validateRes.body.sessionId).toBe(sessionId);
      expect(validateRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
      expect(cookie!.flags).toContain('HttpOnly');
    });
  });

  describe('password sign-in with 2FA setup (mfaPolicy DISABLED)', () => {
    it('should skip MFA and complete full workflow when policy is DISABLED', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTwoFactorAuth(dataSource, user, true);

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      const authRes = await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(authRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────
  // Session lifecycle
  // ──────────────────────────────────────────────────

  describe('session consumption', () => {
    it('should not allow exchange twice', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      // Complete the workflow
      await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      // Session is consumed, second exchange fails
      const response = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should not allow reuse of exchange token', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      // Second token exchange with same OTT fails
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should not allow any action after session is consumed', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(404);

      await request(app.getHttpServer())
        .post(`${BASE}/primary/magic-link`)
        .send({ sessionId, email: 'user@example.com' })
        .expect(404);

      await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId, code: '123456' })
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────
  // Step ordering enforcement
  // ──────────────────────────────────────────────────

  describe('step ordering', () => {
    it('should reject exchange before primary auth', async () => {
      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId: createRes.body.sessionId })
        .expect(401);

      expect(response.body.message).toBe('Primary authentication required');
    });

    it('should reject TOTP before primary auth', async () => {
      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId: createRes.body.sessionId, code: '123456' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should reject magic-link validate without requesting it first', async () => {
      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`${BASE}/primary/magic-link/validate`)
        .query({ sessionId: createRes.body.sessionId, token: 'fake-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });
  });

  // ──────────────────────────────────────────────────
  // Auth method switching
  // ──────────────────────────────────────────────────

  describe('auth method switching', () => {
    it('should complete full workflow with password after requesting magic-link', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/magic-link`)
        .send({ sessionId, email: 'user@example.com' })
        .expect(202);

      await consumeEmailQueue();

      const authRes = await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(authRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────
  // Retry after failure
  // ──────────────────────────────────────────────────

  describe('retry after failure', () => {
    it('should complete full workflow after retrying with correct password', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'wrong' })
        .expect(401);

      const authRes = await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(authRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });

    it('should complete full workflow after retrying with correct TOTP', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'user@example.com', password: 'password123' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId, code: '000000' })
        .expect(401);

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      const mfaRes = await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId, code })
        .expect(200);

      expect(mfaRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });

    it('should complete full workflow after retrying with correct magic-link token', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/magic-link`)
        .send({ sessionId, email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      await request(app.getHttpServer())
        .get(`${BASE}/primary/magic-link/validate`)
        .query({ sessionId, token: 'wrong-token' })
        .expect(401);

      const validateRes = await request(app.getHttpServer())
        .get(`${BASE}/primary/magic-link/validate`)
        .query({ sessionId, token })
        .expect(200);

      expect(validateRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────
  // Session isolation
  // ──────────────────────────────────────────────────

  describe('session isolation', () => {
    it('should not share state between two sessions', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const session1Res = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const session2Res = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const session1 = session1Res.body.sessionId;
      const session2 = session2Res.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId: session1, email: 'user@example.com', password: 'password123' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId: session2 })
        .expect(401);

      expect(response.body.message).toBe('Primary authentication required');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId: session1 })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });

    it('should allow two different users to complete full workflow concurrently', async () => {
      const alice = await createUserWithPassword(dataSource, 'alice@example.com', 'password123');
      const bob = await createUserWithPassword(dataSource, 'bob@example.com', 'password456');

      const session1Res = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const session2Res = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId: session1Res.body.sessionId, email: 'alice@example.com', password: 'password123' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId: session2Res.body.sessionId, email: 'bob@example.com', password: 'password456' })
        .expect(200);

      const exchange1 = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId: session1Res.body.sessionId })
        .expect(200);

      const exchange2 = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId: session2Res.body.sessionId })
        .expect(200);

      const token1 = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchange1.body.exchangeToken })
        .expect(200);

      const token2 = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchange2.body.exchangeToken })
        .expect(200);

      const decoded1 = jwt.verify(
        token1.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      const decoded2 = jwt.verify(
        token2.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded1.sub).toBe(alice.id);
      expect(decoded1.email).toBe('alice@example.com');
      expect(decoded2.sub).toBe(bob.id);
      expect(decoded2.email).toBe('bob@example.com');

      const cookie1 = extractCookie(token1, 'refreshToken');
      const cookie2 = extractCookie(token2, 'refreshToken');
      expect(cookie1).toBeDefined();
      expect(cookie2).toBeDefined();
      expect(cookie1!.value).not.toBe(cookie2!.value);
    });
  });

  // ──────────────────────────────────────────────────
  // Enumeration protection
  // ──────────────────────────────────────────────────

  describe('enumeration protection', () => {
    it('should return same response for magic-link regardless of user existence', async () => {
      await createUserWithPassword(dataSource, 'real@example.com', 'password123');

      const session1Res = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const session2Res = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const realRes = await request(app.getHttpServer())
        .post(`${BASE}/primary/magic-link`)
        .send({ sessionId: session1Res.body.sessionId, email: 'real@example.com' })
        .expect(202);

      const fakeRes = await request(app.getHttpServer())
        .post(`${BASE}/primary/magic-link`)
        .send({ sessionId: session2Res.body.sessionId, email: 'fake@example.com' })
        .expect(202);

      expect(realRes.body.message).toBe(fakeRes.body.message);
    });
  });

  // ──────────────────────────────────────────────────
  // Email normalization
  // ──────────────────────────────────────────────────

  describe('email normalization', () => {
    it('should complete full workflow with uppercase email in password auth', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      const authRes = await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId, email: 'USER@EXAMPLE.COM', password: 'password123' })
        .expect(200);

      expect(authRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });

    it('should complete full workflow with uppercase email in magic-link', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const createRes = await request(app.getHttpServer())
        .post(BASE)
        .send({ tenantId: 'default' })
        .expect(201);

      const sessionId = createRes.body.sessionId;

      await request(app.getHttpServer())
        .post(`${BASE}/primary/magic-link`)
        .send({ sessionId, email: 'USER@EXAMPLE.COM' })
        .expect(202);

      const messages = await consumeEmailQueue();
      expect(messages).toHaveLength(1);
      expect(messages[0].data.email).toBe('user@example.com');
      const token = messages[0].data.token as string;

      const validateRes = await request(app.getHttpServer())
        .get(`${BASE}/primary/magic-link/validate`)
        .query({ sessionId, token })
        .expect(200);

      expect(validateRes.body.nextStep).toBe('complete');

      const exchangeRes = await request(app.getHttpServer())
        .post(`${BASE}/exchange`)
        .send({ sessionId })
        .expect(200);

      const tokenRes = await request(app.getHttpServer())
        .post(`${BASE}/token`)
        .send({ exchangeToken: exchangeRes.body.exchangeToken })
        .expect(200);

      const decoded = jwt.verify(
        tokenRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');

      const cookie = extractCookie(tokenRes, 'refreshToken');
      expect(cookie).toBeDefined();
    });
  });
});
