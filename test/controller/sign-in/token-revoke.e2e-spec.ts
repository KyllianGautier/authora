import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp,
  getTestPrivateKey
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

// Revokes the refresh token (sign out). Revokes the entire token family
// and clears the refreshToken cookie.
describe('POST /auth/sign-in/token/revoke', () => {
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

  describe('validation', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });

    it('should return 401 when refresh token cookie is missing', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', 'Bearer some-jwt')
        .expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });

    it('should return 401 when both are missing', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });

    it('should return 401 when access token is not a valid JWT', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
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
        .post(`${BASE}/token/revoke`)
        .set('Authorization', `Bearer ${fakeAt}`)
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired refresh token');
    });
  });

  describe('behavior', () => {
    it('should return 200 and revoke the entire token family', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken, refreshToken } = await signInUser(app, user.id);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(response.body.message).toBe('Token revoked');

      // Verify the cookie is cleared
      const cookie = extractCookie(response, 'refreshToken');
      expect(cookie).toBeDefined();
      expect(cookie!.value).toBe('');

      // All refresh tokens for the user should be revoked
      const active = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(active).toHaveLength(0);
    });

    it('should return 200 silently when refresh token does not match', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken } = await signInUser(app, user.id);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', 'refreshToken=wrong-token')
        .expect(200);

      expect(response.body.message).toBe('Token revoked');

      // Token should NOT be revoked (wrong RT was provided)
      const active = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(active).toHaveLength(1);
    });

    it('should return 200 silently when no active token exists', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken } = await signInUser(app, user.id);

      // Revoke all tokens manually
      await dataSource
        .getRepository(RefreshTokenEntity)
        .update({ user: { id: user.id } }, { revoked: true });

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', 'refreshToken=some-token')
        .expect(200);

      expect(response.body.message).toBe('Token revoked');
    });

    it('should accept an expired access token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { refreshToken } = await signInUser(app, user.id);

      const expiredAt = jwt.sign(
        { sub: user.id, email: 'user@example.com' },
        getTestPrivateKey(),
        { algorithm: 'RS256', issuer: 'authora', expiresIn: -1 }
      );

      await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', `Bearer ${expiredAt}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      const active = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id }, revoked: false } });

      expect(active).toHaveLength(0);
    });

    it('should prevent refresh after revocation', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const { accessToken, refreshToken } = await signInUser(app, user.id);

      // Revoke
      await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      // Attempt refresh with the revoked token
      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired refresh token');
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post(`${BASE}/token/revoke`)
          .set('Authorization', 'Bearer fake')
          .set('Cookie', 'refreshToken=fake');
      }

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', 'Bearer fake')
        .set('Cookie', 'refreshToken=fake');

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post(`${BASE}/token/revoke`)
          .set('Authorization', `Bearer fake-${i}`)
          .set('Cookie', `refreshToken=fake-${i}`);
      }

      const response = await request(app.getHttpServer())
        .post(`${BASE}/token/revoke`)
        .set('Authorization', 'Bearer fake-final')
        .set('Cookie', 'refreshToken=fake-final');

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
