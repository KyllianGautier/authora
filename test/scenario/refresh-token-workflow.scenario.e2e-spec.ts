import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { defaultTenantConfig } from '../../src/config/tenant-config';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp,
  getTestPublicKey
} from '../setup';
import { createUserWithPassword } from '../controller/utils/create-user-with-password';
import { extractCookie } from '../controller/utils/extract-cookie';

const BASE = '/api/v1/auth/sign-in';

// Helper: full sign-in flow → returns AT + RT
async function signIn(
  app: INestApplication<App>,
  dataSource: DataSource,
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const createRes = await request(app.getHttpServer())
    .post(BASE)
    .expect(201);

  const sessionId = createRes.body.sessionId;

  await request(app.getHttpServer())
    .post(`${BASE}/primary/password`)
    .send({ sessionId, email, password })
    .expect(200);

  const exchangeRes = await request(app.getHttpServer())
    .post(`${BASE}/exchange`)
    .send({ sessionId })
    .expect(200);

  const tokenRes = await request(app.getHttpServer())
    .post(`${BASE}/token`)
    .send({ exchangeToken: exchangeRes.body.exchangeToken })
    .expect(200);

  return {
    accessToken: tokenRes.body.accessToken as string,
    refreshToken: extractCookie(tokenRes, 'refreshToken')!.value
  };
}

describe('Scenario: Refresh token workflows', () => {
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
  // Happy paths
  // ──────────────────────────────────────────────────

  describe('sign-in → refresh → verify new tokens', () => {
    it('should return new AT and rotated RT in the same family', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const { accessToken, refreshToken } = await signIn(app, dataSource, 'user@example.com', 'password123');

      const refreshRes = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      // Verify new access token
      const decoded = jwt.verify(
        refreshRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'], issuer: 'authora' }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');
      expect(refreshRes.body.type).toBe('Bearer');
      expect(refreshRes.body.expiresIn).toBe(
        defaultTenantConfig.jwtAccessTokenExpirationSec
      );

      // Verify new refresh token cookie
      const newCookie = extractCookie(refreshRes, 'refreshToken');
      expect(newCookie).toBeDefined();
      expect(newCookie!.value).not.toBe(refreshToken);
      expect(newCookie!.flags).toContain('HttpOnly');
      expect(newCookie!.flags).toContain('Secure');
      expect(newCookie!.flags).toContain('SameSite=Strict');

      // Old refresh token is revoked, new one is active, same family
      const tokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } }, order: { createdAt: 'ASC' } });

      expect(tokens).toHaveLength(2);
      expect(tokens[0].revoked).toBe(true);
      expect(tokens[1].revoked).toBe(false);
      expect(tokens[0].family).toBe(tokens[1].family);
    });
  });

  describe('chained refreshes', () => {
    it('should keep all tokens in the same family with only the last active', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      let { accessToken: at, refreshToken: rt } = await signIn(app, dataSource, 'user@example.com', 'password123');

      // Chain 3 refreshes
      for (let i = 0; i < 3; i++) {
        const res = await request(app.getHttpServer())
          .post(`${BASE}/token/refresh`)
          .set('Authorization', `Bearer ${at}`)
          .set('Cookie', `refreshToken=${rt}`)
          .expect(200);

        at = res.body.accessToken as string;
        rt = extractCookie(res, 'refreshToken')!.value;
      }

      // Final AT is still valid
      const decoded = jwt.verify(at, getTestPublicKey(), {
        algorithms: ['RS256'],
        issuer: 'authora'
      }) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      // 1 original + 3 rotations = 4 tokens, all same family, only last active
      const tokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(tokens).toHaveLength(4);

      const families = new Set(tokens.map((t) => t.family));
      expect(families.size).toBe(1);

      const active = tokens.filter((t) => !t.revoked);
      expect(active).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────────
  // Reuse detection
  // ──────────────────────────────────────────────────

  describe('reuse detection', () => {
    it('should revoke the entire family when a used token is replayed', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const { accessToken: originalAt, refreshToken: originalRt } =
        await signIn(app, dataSource, 'user@example.com', 'password123');

      // Legitimate refresh
      const refreshRes = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${originalAt}`)
        .set('Cookie', `refreshToken=${originalRt}`)
        .expect(200);

      const newAt = refreshRes.body.accessToken as string;

      // Attacker replays the original (now revoked) refresh token
      const replayRes = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${newAt}`)
        .set('Cookie', `refreshToken=${originalRt}`)
        .expect(401);

      expect(replayRes.body.message).toBe('Invalid or expired refresh token');

      // Entire family is revoked — no active tokens remain
      const active = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(active).toHaveLength(0);
    });

    it('should invalidate the new token too after reuse is detected', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const { accessToken: originalAt, refreshToken: originalRt } =
        await signIn(app, dataSource, 'user@example.com', 'password123');

      // Legitimate refresh
      const refreshRes = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${originalAt}`)
        .set('Cookie', `refreshToken=${originalRt}`)
        .expect(200);

      const newAt = refreshRes.body.accessToken as string;
      const newRt = extractCookie(refreshRes, 'refreshToken')!.value;

      // Trigger reuse detection
      await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${newAt}`)
        .set('Cookie', `refreshToken=${originalRt}`)
        .expect(401);

      // The new (legitimate) refresh token is now also revoked
      const finalRes = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${newAt}`)
        .set('Cookie', `refreshToken=${newRt}`)
        .expect(401);

      expect(finalRes.body.message).toBe('Invalid or expired refresh token');
    });
  });

  // ──────────────────────────────────────────────────
  // Recovery after revocation
  // ──────────────────────────────────────────────────

  describe('recovery after family revocation', () => {
    it('should allow a fresh sign-in with a new family', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const { accessToken: at1, refreshToken: rt1 } =
        await signIn(app, dataSource, 'user@example.com', 'password123');

      // Refresh, then replay to trigger family revocation
      await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${at1}`)
        .set('Cookie', `refreshToken=${rt1}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${at1}`)
        .set('Cookie', `refreshToken=${rt1}`)
        .expect(401);

      // Fresh sign-in creates a new family
      const { accessToken: at2 } =
        await signIn(app, dataSource, 'user@example.com', 'password123');

      const decoded = jwt.verify(at2, getTestPublicKey(), {
        algorithms: ['RS256'],
        issuer: 'authora'
      }) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);

      // New family is distinct from the revoked one
      const active = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(active).toHaveLength(1);

      const revokedTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: true } });

      const oldFamilies = new Set(revokedTokens.map((t) => t.family));
      expect(oldFamilies.has(active[0].family)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────
  // Family isolation
  // ──────────────────────────────────────────────────

  describe('family isolation', () => {
    it('should not affect another family when reuse is detected', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Family A
      const familyA = await signIn(app, dataSource, 'user@example.com', 'password123');
      // Family B (create() revokes family A's active token)
      const familyB = await signIn(app, dataSource, 'user@example.com', 'password123');

      // Replay family A's old (revoked) token → revokes family A
      await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${familyA.accessToken}`)
        .set('Cookie', `refreshToken=${familyA.refreshToken}`)
        .expect(401);

      // Family B is untouched
      const refreshRes = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${familyB.accessToken}`)
        .set('Cookie', `refreshToken=${familyB.refreshToken}`)
        .expect(200);

      const decoded = jwt.verify(
        refreshRes.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'], issuer: 'authora' }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
    });
  });
});
