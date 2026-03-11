import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import { UserEntity } from '../../src/entity/user.entity';
import {
  clearDatabase,
  consumeEmailQueue,
  getTestApp,
  getTestPrivateKey,
  getTestPublicKey
} from '../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';

describe('POST /sign-in/refresh', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 120_000);

  beforeEach(async () => {
    await clearDatabase();
    await consumeEmailQueue();
  });

  async function signInAndGetTokens(
    rememberMe = false
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const response = await request(app.getHttpServer())
      .post('/sign-in')
      .send({
        email: 'user@example.com',
        password: 'password123',
        rememberMe
      })
      .expect(200);

    const cookie = extractCookie(response, 'refreshToken');
    return {
      accessToken: response.body.accessToken,
      refreshToken: cookie!.value
    };
  }

  function makeExpiredToken(
    userId: string,
    email: string
  ): string {
    return jwt.sign(
      { sub: userId, email },
      getTestPrivateKey(),
      { algorithm: 'RS256', expiresIn: -1 }
    );
  }

  describe('validation', () => {
    it('should return 401 when Authorization header is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-in/refresh')
        .expect(401);
    });

    it('should return 401 when Authorization header has no Bearer prefix', () => {
      return request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', 'some-token')
        .expect(401);
    });

    it('should return 401 when refresh token cookie is missing', () => {
      const expiredToken = jwt.sign(
        { sub: 'fake-id', email: 'user@example.com' },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      return request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should return 401 when access token is invalid', () => {
      return request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', 'Bearer invalid-jwt')
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);
    });
  });

  describe('behavior', () => {
    it('should return 400 when access token is not yet expired', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const { accessToken, refreshToken } = await signInAndGetTokens();

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
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
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', 'refreshToken=some-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 when refresh token is wrong', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      await signInAndGetTokens();

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', 'refreshToken=wrong-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 when refresh token has been revoked', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken } = await signInAndGetTokens();

      // Sign in again to revoke the first refresh token
      await signInAndGetTokens();

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 when refresh token is expired', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      await signInAndGetTokens();

      // Manually expire the refresh token in the database
      await dataSource
        .getRepository(RefreshTokenEntity)
        .update(
          { user: { id: user.id }, revoked: false },
          { expiredAt: new Date(Date.now() - 1000) }
        );

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', 'refreshToken=any-token')
        .expect(401);
    });

    it('should return 200 with new access token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken } = await signInAndGetTokens();

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.type).toBe('Bearer');
      expect(response.body.expiresIn).toBe(900);

      // Verify the new access token is valid
      const decoded = jwt.verify(
        response.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'] }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');
    });

    it('should set a new refreshToken httpOnly cookie', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken } = await signInAndGetTokens();

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      const cookie = extractCookie(response, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value.length).toBeGreaterThan(0);
      expect(cookie!.value).not.toBe(refreshToken);
      expect(cookie!.flags).toContain('HttpOnly');
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');
    });

    it('should revoke the previous refresh token after refresh', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken } = await signInAndGetTokens();

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({
          where: { user: { id: user.id } },
          order: { createdAt: 'ASC' }
        });

      expect(refreshTokens).toHaveLength(2);
      expect(refreshTokens[0].revoked).toBe(true);
      expect(refreshTokens[1].revoked).toBe(false);
    });

    it('should preserve the expiration date of the previous refresh token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken } = await signInAndGetTokens();

      // Get the original expiration date
      const originalToken = await dataSource
        .getRepository(RefreshTokenEntity)
        .findOne({ where: { user: { id: user.id }, revoked: false } });

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      const newToken = await dataSource
        .getRepository(RefreshTokenEntity)
        .findOne({ where: { user: { id: user.id }, revoked: false } });

      expect(newToken!.expiredAt.getTime()).toBe(
        originalToken!.expiredAt.getTime()
      );
    });

    it('should not reuse the old refresh token after rotation', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken } = await signInAndGetTokens();

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      // First refresh succeeds
      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      // Second refresh with the same old refresh token fails
      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(401);
    });

    it('should not return refreshToken in the response body', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken } = await signInAndGetTokens();

      const expiredToken = jwt.sign(
        { sub: user.id, email: user.email },
        getTestPrivateKey(),
        { algorithm: 'RS256', expiresIn: -1 }
      );

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(response.body.refreshToken).toBeUndefined();
    });
  });

  describe('colliding scenarios', () => {
    it('should invalidate refreshed token when a new sign-in occurs', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken: firstRefreshToken } = await signInAndGetTokens();

      // Refresh to get a rotated token
      const expiredToken = makeExpiredToken(user.id, user.email);

      const refreshResponse = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${firstRefreshToken}`)
        .expect(200);

      const rotatedRefreshToken = extractCookie(
        refreshResponse,
        'refreshToken'
      )!.value;

      // A new sign-in revokes the rotated token
      await signInAndGetTokens();

      // The rotated refresh token should no longer work
      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${rotatedRefreshToken}`)
        .expect(401);
    });

    it('should allow refresh after multiple consecutive sign-ins', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      // Sign in three times — only the last refresh token should be valid
      await signInAndGetTokens();
      await signInAndGetTokens();
      const { refreshToken } = await signInAndGetTokens();

      const expiredToken = makeExpiredToken(user.id, user.email);

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
    });

    it('should chain multiple refreshes successfully', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const { refreshToken: firstRefreshToken } = await signInAndGetTokens();
      const expiredToken = makeExpiredToken(user.id, user.email);

      // First refresh
      const firstRefresh = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${firstRefreshToken}`)
        .expect(200);

      const secondRefreshToken = extractCookie(
        firstRefresh,
        'refreshToken'
      )!.value;

      // Second refresh using the rotated token
      const secondRefresh = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Cookie', `refreshToken=${secondRefreshToken}`)
        .expect(200);

      expect(secondRefresh.body.accessToken).toBeDefined();

      // All previous tokens should be revoked, only the latest active
      const tokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({
          where: { user: { id: user.id } },
          order: { createdAt: 'ASC' }
        });

      expect(tokens).toHaveLength(3);
      expect(tokens[0].revoked).toBe(true);
      expect(tokens[1].revoked).toBe(true);
      expect(tokens[2].revoked).toBe(false);
    });

    it('should reject refresh with a token from a different user', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );
      const userB = await createUserWithPassword(
        dataSource,
        'other@example.com',
        'password456'
      );

      // Sign in as user A
      const { refreshToken: refreshTokenA } = await signInAndGetTokens();

      // Build an expired JWT for user B
      const expiredTokenB = makeExpiredToken(userB.id, userB.email);

      // Try to refresh user B's session using user A's refresh token
      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredTokenB}`)
        .set('Cookie', `refreshToken=${refreshTokenA}`)
        .expect(401);
    });

    it('should keep separate refresh token chains per user', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const userB = await createUserWithPassword(
        dataSource,
        'other@example.com',
        'password456'
      );

      // Sign in as user A
      const { refreshToken: refreshTokenA } = await signInAndGetTokens();

      // Sign in as user B
      const signInB = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'other@example.com',
          password: 'password456',
          rememberMe: false
        })
        .expect(200);

      const refreshTokenB = extractCookie(signInB, 'refreshToken')!.value;
      const expiredTokenB = makeExpiredToken(userB.id, userB.email);

      // Refresh user B — should not affect user A's token
      await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredTokenB}`)
        .set('Cookie', `refreshToken=${refreshTokenB}`)
        .expect(200);

      // User A's refresh token should still be valid
      const userA = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });

      const expiredTokenA = makeExpiredToken(userA!.id, userA!.email);

      const response = await request(app.getHttpServer())
        .post('/sign-in/refresh')
        .set('Authorization', `Bearer ${expiredTokenA}`)
        .set('Cookie', `refreshToken=${refreshTokenA}`)
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
    });
  });
});
