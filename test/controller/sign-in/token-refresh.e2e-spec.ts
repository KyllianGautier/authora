import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { defaultTenantConfig } from '../../../src/config/tenant-config';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import { LockReason, UserEntity } from '../../../src/entity/user.entity';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp,
  getTestPrivateKey,
  getTestPublicKey
} from '../../setup';
import {
  createOneTimeToken,
  FAKE_ONE_TIME_TOKEN
} from '../utils/create-one-time-token';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';

const BASE = '/api/v1/auth/sign-in';

// Helper: sign-in a user through exchange → token to get a valid AT + RT pair
async function signInUser(
  app: INestApplication<App>,
  userId: string
): Promise<{ accessToken: string; refreshToken: string }> {
  await createOneTimeToken(app, userId, OneTimeTokenType.Exchange);

  const response = await request(app.getHttpServer())
    .post(`${BASE}/token`)
    .send({ exchangeToken: FAKE_ONE_TIME_TOKEN })
    .expect(200);

  const cookie = extractCookie(response, 'refreshToken');

  return {
    accessToken: response.body.accessToken as string,
    refreshToken: cookie!.value
  };
}

// Refreshes access and refresh tokens using the expired AT (Authorization header)
// and the refresh token (httpOnly cookie). Implements refresh token rotation
// with family-based reuse detection.
describe('POST /auth/sign-in/token/refresh', () => {
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

  describe('validation', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });

    it('should return 401 when refresh token cookie is missing', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', 'Bearer some-jwt')
        .expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });

    it('should return 401 when both are missing', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });
  });

  describe('behavior', () => {
    it('should return 401 when access token is not a valid JWT', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', 'Bearer not-a-jwt')
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid access token');
    });

    it('should return 401 when user from access token does not exist', async () => {
      const fakeAt = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', email: 'gone@example.com' },
        getTestPrivateKey(),
        { algorithm: 'RS256', issuer: 'authora' }
      );

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${fakeAt}`)
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired refresh token');
    });

    it('should return 401 when refresh token does not match', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken } = await signInUser(app, user.id);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', 'refreshToken=wrong-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired refresh token');
    });

    it('should return 200 with new access token and rotated refresh token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken, refreshToken } = await signInUser(app, user.id);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      // Verify new access token
      expect(response.body.type).toBe('Bearer');
      expect(response.body.expiresIn).toBe(
        defaultTenantConfig.jwtAccessTokenExpirationSec
      );

      const decoded = jwt.verify(
        response.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'], issuer: 'authora' }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');

      // Verify new refresh token cookie
      const cookie = extractCookie(response, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value).not.toBe(refreshToken);
      expect(cookie!.flags).toContain('HttpOnly');
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');
    });

    it('should accept an expired access token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { refreshToken } = await signInUser(app, user.id);

      // Sign an already-expired AT
      const expiredAt = jwt.sign(
        { sub: user.id, email: 'user@example.com' },
        getTestPrivateKey(),
        { algorithm: 'RS256', issuer: 'authora', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${expiredAt}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
    });

    it('should revoke the old refresh token after rotation', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken, refreshToken } = await signInUser(app, user.id);

      await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      // The old refresh token should now be revoked
      const tokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } }, order: { createdAt: 'ASC' } });

      expect(tokens).toHaveLength(2);
      expect(tokens[0].revoked).toBe(true);
      expect(tokens[1].revoked).toBe(false);
      // Both should belong to the same family
      expect(tokens[0].family).toBe(tokens[1].family);
    });

    it('should allow chained refreshes', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      let { accessToken, refreshToken } = await signInUser(app, user.id);

      // Refresh twice in sequence
      for (let i = 0; i < 2; i++) {
        const response = await request(app.getHttpServer())
          .post(`${BASE}/token/refresh`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Cookie', `refreshToken=${refreshToken}`)
          .expect(200);

        accessToken = response.body.accessToken as string;
        refreshToken = extractCookie(response, 'refreshToken')!.value;
      }

      // All tokens in the same family: 1 from sign-in + 2 from refreshes
      const tokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(tokens).toHaveLength(3);

      const families = new Set(tokens.map((t) => t.family));
      expect(families.size).toBe(1);

      const active = tokens.filter((t) => !t.revoked);
      expect(active).toHaveLength(1);
    });
  });

  // Refresh token family reuse detection: replaying an already-used
  // refresh token should revoke the entire family.
  describe('reuse detection', () => {
    it('should revoke the entire family when a used token is replayed', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken, refreshToken: oldRefreshToken } =
        await signInUser(app, user.id);

      // First refresh — succeeds, old token is revoked
      const firstRefresh = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${oldRefreshToken}`)
        .expect(200);

      const newAccessToken = firstRefresh.body.accessToken as string;

      // Replay the old (now revoked) token — should trigger reuse detection
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${newAccessToken}`)
        .set('Cookie', `refreshToken=${oldRefreshToken}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired refresh token');

      // All tokens in the family should be revoked
      const tokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      const active = tokens.filter((t) => !t.revoked);
      expect(active).toHaveLength(0);
    });

    it(`should lock the user after ${defaultTenantConfig.tokenReuseMaxCompromisedFamilies} reuse detections`, async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      for (let i = 0; i < defaultTenantConfig.tokenReuseMaxCompromisedFamilies; i++) {
        const { accessToken, refreshToken } = await signInUser(app, user.id);

        // Rotate to create a revoked token
        const refreshRes = await request(app.getHttpServer())
          .post(`${BASE}/token/refresh`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Cookie', `refreshToken=${refreshToken}`)
          .expect(200);

        const newAt = refreshRes.body.accessToken as string;

        // Replay the revoked token
        await request(app.getHttpServer())
          .post(`${BASE}/token/refresh`)
          .set('Authorization', `Bearer ${newAt}`)
          .set('Cookie', `refreshToken=${refreshToken}`)
          .expect(401);
      }

      const lockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(lockedUser!.isLocked).toBe(true);
      expect(lockedUser!.lockReason).toBe(LockReason.SuspiciousActivity);
    });

    it('should not lock the user below the reuse threshold', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      for (let i = 0; i < defaultTenantConfig.tokenReuseMaxCompromisedFamilies - 1; i++) {
        const { accessToken, refreshToken } = await signInUser(app, user.id);

        const refreshRes = await request(app.getHttpServer())
          .post(`${BASE}/token/refresh`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Cookie', `refreshToken=${refreshToken}`)
          .expect(200);

        const newAt = refreshRes.body.accessToken as string;

        await request(app.getHttpServer())
          .post(`${BASE}/token/refresh`)
          .set('Authorization', `Bearer ${newAt}`)
          .set('Cookie', `refreshToken=${refreshToken}`)
          .expect(401);
      }

      const notLockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(notLockedUser!.isLocked).toBe(false);
    });

    it('should not affect tokens from a different family', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      // First sign-in → family A
      const familyA = await signInUser(app, user.id);

      // Second sign-in → family B (create() revokes family A's active token, but creates a new family)
      const familyB = await signInUser(app, user.id);

      // Refresh family A's old token (already revoked by second sign-in's create())
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${familyA.accessToken}`)
        .set('Cookie', `refreshToken=${familyA.refreshToken}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired refresh token');

      // Family B's active token should still be valid
      const activeTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(activeTokens).toHaveLength(1);

      // Refresh with family B should still work
      await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${familyB.accessToken}`)
        .set('Cookie', `refreshToken=${familyB.refreshToken}`)
        .expect(200);
    });
  });

});
