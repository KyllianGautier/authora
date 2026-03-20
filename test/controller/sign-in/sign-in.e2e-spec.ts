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
  getTestPublicKey
} from '../../setup';
import { createRefreshToken } from '../utils/create-refresh-token';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';
import { hashVerify } from '../utils/hash';

// Authenticates a user with email/password, returns a JWT access token in the body
// and a refresh token as an httpOnly secure cookie.
describe('POST /sign-in', () => {
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
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({ password: 'password123', rememberMe: false })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({ email: 'not-an-email', password: 'password123', rememberMe: false })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({ email: 'user@example.com', rememberMe: false })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({ email: 'user@example.com', password: '', rememberMe: false })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty'
      ]);
    });

    it('should return 400 when rememberMe is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'rememberMe must be a boolean value'
      ]);
    });

    it('should return 400 when rememberMe is not a boolean', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: 'yes'
        })
        .expect(400);

      expect(response.body.message).toEqual([
        'rememberMe must be a boolean value'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'email must be an email',
        'password should not be empty',
        'password must be a string',
        'rememberMe must be a boolean value'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'unknown@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when password is wrong', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'correctPassword'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'user@example.com',
          password: 'wrongPassword',
          rememberMe: false
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 with a valid JWT access token and refresh token cookie', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      // Verify the access token is a valid RS256 JWT containing the user's identity
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

      // Verify the refresh token is delivered as a secure httpOnly cookie
      const cookie = extractCookie(response, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value.length).toBeGreaterThan(0);
      expect(cookie!.flags).toContain('HttpOnly');
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');

      // Verify the clear refresh token in the cookie matches the hashed value stored in DB
      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].revoked).toBe(false);
      await expect(
        hashVerify(refreshTokens[0].tokenHash, cookie!.value)
      ).resolves.toBe(true);
    });

    // A new sign-in must revoke any existing refresh token to prevent session accumulation
    it('should revoke previous refresh token on sign-in', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await createRefreshToken(dataSource, user);

      await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
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

    // Refresh token expiration depends on rememberMe: short (session) vs long (persistent)
    it('should use short expiration when rememberMe is false', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const beforeSignIn = new Date();

      await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      const refreshToken = await dataSource
        .getRepository(RefreshTokenEntity)
        .findOne({ where: { user: { id: user.id }, revoked: false } });

      const expectedExpiration = new Date(
        beforeSignIn.getTime() +
          Number(process.env.JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS) * 1000
      );

      expect(refreshToken!.expiredAt.getTime()).toBeLessThanOrEqual(
        expectedExpiration.getTime() + 5000
      );
      expect(refreshToken!.expiredAt.getTime()).toBeGreaterThanOrEqual(
        expectedExpiration.getTime() - 5000
      );
    });

    it('should use long expiration when rememberMe is true', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const beforeSignIn = new Date();

      await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: true
        })
        .expect(200);

      const refreshToken = await dataSource
        .getRepository(RefreshTokenEntity)
        .findOne({ where: { user: { id: user.id }, revoked: false } });

      const expectedExpiration = new Date(
        beforeSignIn.getTime() +
          Number(process.env.JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS) * 1000
      );

      expect(refreshToken!.expiredAt.getTime()).toBeLessThanOrEqual(
        expectedExpiration.getTime() + 5000
      );
      expect(refreshToken!.expiredAt.getTime()).toBeGreaterThanOrEqual(
        expectedExpiration.getTime() - 5000
      );
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({
          email: 'User@Example.COM',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in')
          .send({ email: 'combined@example.com', password: 'password123', rememberMe: false });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({ email: 'combined@example.com', password: 'password123', rememberMe: false });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com', password: 'password123', rememberMe: false });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com', password: 'password123', rememberMe: false });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-in')
          .send({ email: `origin-${i}@example.com`, password: 'password123', rememberMe: false });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-in')
        .send({ email: 'origin-final@example.com', password: 'password123', rememberMe: false });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
