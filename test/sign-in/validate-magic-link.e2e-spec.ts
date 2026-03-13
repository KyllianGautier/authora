import { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import {
  resetTestState,
  consumeEmailQueue,
  getTestApp,
  getTestPublicKey
} from '../setup';
import { hashVerify } from '../utils/hash';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';

async function requestMagicLinkToken(
  app: INestApplication<App>,
  email: string
): Promise<string> {
  await request(app.getHttpServer())
    .post('/sign-in/magic-link')
    .send({ email });

  const messages = await consumeEmailQueue();
  return messages[0].data.token as string;
}

describe('POST /sign-in/magic-link/validate', () => {
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
    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ token: 'some-token' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'not-an-email', token: 'some-token' })
        .expect(400);
    });

    it('should return 400 when token is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com' })
        .expect(400);
    });

    it('should return 400 when token is empty', () => {
      return request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token: '' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'unknown@example.com', token: 'invalid-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when token is invalid', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      await requestMagicLinkToken(app, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token: 'wrong-token' })
        .expect(401);

      expect(response.body.message).toBe('One-time token is invalid');
    });

    it('should return 404 when no magic-link token exists for user', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token: 'some-token' })
        .expect(404);

      expect(response.body.message).toBe('One-time token not found');
    });

    it('should return 200 with accessToken, type and expiresIn', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const token = await requestMagicLinkToken(app, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.type).toBe('Bearer');
      expect(response.body.expiresIn).toBe(900);
    });

    it('should return a valid JWT access token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const token = await requestMagicLinkToken(app, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token })
        .expect(200);

      const decoded = jwt.verify(response.body.accessToken, getTestPublicKey(), {
        algorithms: ['RS256']
      }) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');
    });

    it('should not return refreshToken in the response body', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const token = await requestMagicLinkToken(app, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token })
        .expect(200);

      expect(response.body.refreshToken).toBeUndefined();
    });

    it('should set refreshToken as an httpOnly cookie', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const token = await requestMagicLinkToken(app, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token })
        .expect(200);

      const cookie = extractCookie(response, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value.length).toBeGreaterThan(0);
      expect(cookie!.flags).toContain('HttpOnly');
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');
    });

    it('should store the refresh token in the database', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const token = await requestMagicLinkToken(app, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'user@example.com', token })
        .expect(200);

      const cookie = extractCookie(response, 'refreshToken');

      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].revoked).toBe(false);

      const matches = await hashVerify(
        refreshTokens[0].tokenHash,
        cookie!.value
      );
      expect(matches).toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const token = await requestMagicLinkToken(app, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'User@Example.COM', token })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
    });
  });

  describe('throttling', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/sign-in/magic-link/validate')
          .send({ email: 'throttle@example.com', token: 'some-token' });
      }

      const response = await request(app.getHttpServer())
        .post('/sign-in/magic-link/validate')
        .send({ email: 'throttle@example.com', token: 'some-token' });

      expect(response.status).toBe(429);
    });
  });
});
