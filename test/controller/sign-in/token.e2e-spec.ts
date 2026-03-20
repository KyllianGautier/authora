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
  getTestPublicKey
} from '../../setup';
import { createOneTimeToken, FAKE_ONE_TIME_TOKEN } from '../utils/create-one-time-token';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';
import { hashVerify } from '../utils/hash';

// Exchanges a one-time exchange token for an access token (body) and refresh token (cookie).
describe('POST /auth/sign-in/token', () => {
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

  describe('validation', () => {
    it('should return 400 when exchangeToken is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'exchangeToken should not be empty',
        'exchangeToken must be a string'
      ]);
    });

    it('should return 400 when exchangeToken is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'exchangeToken should not be empty'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 401 when exchange token is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: 'invalid-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 200 with access token and refresh token cookie', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createOneTimeToken(app, user.id, OneTimeTokenType.Exchange);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: FAKE_ONE_TIME_TOKEN })
        .expect(200);

      // Verify access token
      expect(response.body.type).toBe('Bearer');
      expect(response.body.expiresIn).toBe(
        Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS)
      );
      expect(response.body.authSessionId).toBeDefined();
      expect(typeof response.body.authSessionId).toBe('string');

      const decoded = jwt.verify(
        response.body.accessToken,
        getTestPublicKey(),
        { algorithms: ['RS256'], issuer: 'authora' }
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');
      expect(decoded.iss).toBe('authora');

      const { header } = jwt.decode(response.body.accessToken, {
        complete: true
      }) as jwt.Jwt;
      expect(header.kid).toBe('CHANGE_IT');

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
    });

    it('should revoke the exchange token after use', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createOneTimeToken(app, user.id, OneTimeTokenType.Exchange);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: FAKE_ONE_TIME_TOKEN })
        .expect(200);

      // Second use should fail
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: FAKE_ONE_TIME_TOKEN })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 401 when exchange token is expired', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // No token created in Redis — equivalent to an expired token (TTL elapsed)
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: FAKE_ONE_TIME_TOKEN })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });
  });

  // Three-dimensional rate limiting.
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/token')
          .send({ exchangeToken: 'fake-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: 'fake-token' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/token')
          .send({ exchangeToken: `fake-token-${i}` });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/token')
        .send({ exchangeToken: 'fake-token-final' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
