import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { testTenantConfig } from '../../../src/config/tenant-config';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp,
  getTestPublicKey
} from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';
import { getAuthSession } from '../utils/get-auth-session';
import { getDefaultTenant } from '../utils/get-default-tenant';
import { hashVerify } from '../utils/hash';

// POST /auth/sign-in/exchange-session (first-party) — exchanges a completed session
// directly for access and refresh tokens, without an intermediate exchange token.
describe('POST /auth/sign-in/exchange-session (first-party)', () => {
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
    it('should return 400 when sessionId is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when sessionId is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({ sessionId: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({ sessionId: 'non-existent-session' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 401 when primary auth is not verified', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: false
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({ sessionId: session.id })
        .expect(401);

      expect(response.body.message).toBe('Primary authentication required');
    });

    it('should return 401 when session is already exchanged', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true,
        exchanged: true
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({ sessionId: session.id })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 200 with access token and refresh token cookie', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const tenant = await getDefaultTenant(dataSource);
      const session = await createAuthSession(app, {
        userId: user.id,
        tenantId: tenant.id,
        primaryAuthVerified: true
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({ sessionId: session.id })
        .expect(200);

      // Verify access token
      expect(response.body.type).toBe('Bearer');
      expect(response.body.expiresIn).toBe(testTenantConfig.jwtAccessTokenExpirationSec);

      const decoded = jwt.verify(
        response.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'], issuer: 'authora' }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');

      // Verify the refresh token cookie
      const cookie = extractCookie(response, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value.length).toBeGreaterThan(0);
      expect(cookie!.flags).toContain('HttpOnly');
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');

      // Verify refresh token is stored in DB
      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].revoked).toBe(false);
      await expect(
        hashVerify(refreshTokens[0].tokenHash, cookie!.value)
      ).resolves.toBe(true);

      // Verify the auth session is deleted from Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).toBeNull();
    });

    it('should not be reusable — second exchange should fail', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const tenant = await getDefaultTenant(dataSource);
      const session = await createAuthSession(app, {
        userId: user.id,
        tenantId: tenant.id,
        primaryAuthVerified: true
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({ sessionId: session.id })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/exchange-session')
        .send({ sessionId: session.id })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });
  });
});
