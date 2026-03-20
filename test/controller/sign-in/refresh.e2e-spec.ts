import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp,
  getTestPrivateKey,
  getTestPublicKey
} from '../../setup';
import { createRefreshToken } from '../utils/create-refresh-token';
import { getExpiredDate } from '../utils/date';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';
import { hashVerify } from '../utils/hash';

const FAKE_REFRESH_TOKEN = 'fake-refresh-token';

// Rotates an expired access token using a valid refresh token cookie.
// Issues a new access token + new refresh token, revokes the old refresh token,
// and preserves the original expiration date on the new refresh token.
describe('POST /sign-in/refresh', () => {
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

  // Helper to craft a JWT that is already expired (expiresIn: -1)
  // Used as the normal input for refresh, since the endpoint expects an expired access token
  function makeExpiredToken(userId: string, email: string): string {
    return jwt.sign(
      { sub: userId, email },
      getTestPrivateKey(),
      { algorithm: 'RS256', expiresIn: -1 }
    );
  }

  // Helper to craft a still-valid JWT, used to test that the endpoint rejects non-expired tokens
  function makeValidToken(userId: string, email: string): string {
    return jwt.sign(
      { sub: userId, email },
      getTestPrivateKey(),
      { algorithm: 'RS256', expiresIn: 900 }
    );
  }

  describe('validation', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .expect(401);

      expect(response.body.message).toBe('Missing access token');
    });

    it('should return 401 when Authorization header has no Bearer prefix', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', 'some-token')
        .expect(401);

      expect(response.body.message).toBe('Missing access token');
    });

    it('should return 401 when refresh token cookie is missing', async () => {
      const expiredToken = jwt.sign(
        { sub: 'fake-id', email: 'user@example.com' },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });

    it('should return 401 when access token is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', 'Bearer invalid-jwt')
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid access token');
    });
  });

  describe('behavior', () => {
    it('should return 400 when access token is not yet expired', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createRefreshToken(dataSource, user);
      const validToken = makeValidToken(user.id, user.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Cookie', `refreshToken=${FAKE_REFRESH_TOKEN}`)
        .expect(400);

      expect(response.body.message).toBe('Access token is not yet expired');
    });

    it('should return 401 when user does not exist', async () => {
      const expiredToken = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', email: 'user@example.com' },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${FAKE_REFRESH_TOKEN}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 when refresh token is wrong', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createRefreshToken(dataSource, user);
      const expiredToken = makeExpiredToken(user.id, user.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', 'refreshToken=wrong-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });

    // Simulate a stolen token scenario: revoked tokens must not grant new access
    it('should return 401 when refresh token has been revoked', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const refreshToken = await createRefreshToken(dataSource, user);

      await dataSource
        .getRepository(RefreshTokenEntity)
        .update({ id: refreshToken.id }, { revoked: true });

      const expiredToken = makeExpiredToken(user.id, user.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${FAKE_REFRESH_TOKEN}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 when refresh token is expired', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const refreshToken = await createRefreshToken(dataSource, user);

      await dataSource
        .getRepository(RefreshTokenEntity)
        .update(
          { id: refreshToken.id },
          { expiredAt: getExpiredDate() }
        );

      const expiredToken = makeExpiredToken(user.id, user.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${FAKE_REFRESH_TOKEN}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 200 with new access token, rotate refresh token and preserve expiration', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const originalToken = await createRefreshToken(dataSource, user);
      const expiredToken = makeExpiredToken(user.id, user.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${FAKE_REFRESH_TOKEN}`)
        .expect(200);

      // Verify the new access token is a valid RS256 JWT
      expect(response.body.type).toBe('Bearer');
      expect(response.body.expiresIn).toBe(
        Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS)
      );
      expect(response.body.refreshToken).toBeUndefined();

      const decoded = jwt.verify(
        response.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');

      // Verify a new refresh token cookie was issued (different from the one sent)
      const cookie = extractCookie(response, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value).not.toBe(FAKE_REFRESH_TOKEN);
      expect(cookie!.flags).toContain('HttpOnly');
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');

      // Token rotation: old token revoked, new token active with matching cookie hash
      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({
          where: { user: { id: user.id } },
          order: { createdAt: 'ASC' }
        });

      expect(refreshTokens).toHaveLength(2);
      expect(refreshTokens[0].revoked).toBe(true);
      expect(refreshTokens[1].revoked).toBe(false);
      await expect(
        hashVerify(refreshTokens[1].tokenHash, cookie!.value)
      ).resolves.toBe(true);

      // The new refresh token must keep the original expiration date (no lifetime extension)
      expect(refreshTokens[1].expiredAt.getTime()).toBe(
        originalToken.expiredAt.getTime()
      );
    });
  });

  // No identity throttle since this endpoint has no email in body;
  // combined and origin keys both fall back to IP.
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/refresh')
          .set('Authorization', 'Bearer fake-token')
          .set('Cookie', 'refreshToken=fake-token');
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', 'Bearer fake-token')
        .set('Cookie', 'refreshToken=fake-token');

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in/refresh')
          .set('Authorization', 'Bearer fake-token')
          .set('Cookie', 'refreshToken=fake-token');
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in/refresh')
        .set('Authorization', 'Bearer fake-token')
        .set('Cookie', 'refreshToken=fake-token');

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
