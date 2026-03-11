import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import {
  clearDatabase,
  consumeEmailQueue,
  getTestApp,
  getTestPublicKey
} from '../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { extractCookie } from '../utils/extract-cookie';

describe('POST /sign-in', () => {
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

  describe('validation', () => {
    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-in')
        .send({ password: 'password123', rememberMe: false })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/sign-in')
        .send({ email: 'not-an-email', password: 'password123', rememberMe: false })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-in')
        .send({ email: 'user@example.com', rememberMe: false })
        .expect(400);
    });

    it('should return 400 when password is empty', () => {
      return request(app.getHttpServer())
        .post('/sign-in')
        .send({ email: 'user@example.com', password: '', rememberMe: false })
        .expect(400);
    });

    it('should return 400 when rememberMe is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-in')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when rememberMe is not a boolean', () => {
      return request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: 'yes'
        })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/sign-in')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'unknown@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when password is wrong', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'correctPassword');

      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'wrongPassword',
          rememberMe: false
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 with accessToken, type and expiresIn', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.type).toBe('Bearer');
      expect(response.body.expiresIn).toBe(900);
    });

    it('should not return refreshToken in the response body', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      expect(response.body.refreshToken).toBeUndefined();
    });

    it('should return a valid JWT access token', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      const decoded = jwt.verify(response.body.accessToken, getTestPublicKey(), {
        algorithms: ['RS256']
      }) as jwt.JwtPayload;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe('user@example.com');
    });

    it('should set refreshToken as an httpOnly cookie', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
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

      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      const cookie = extractCookie(response, 'refreshToken');

      const refreshTokens = await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].revoked).toBe(false);

      const matches = await bcrypt.compare(
        cookie!.value,
        refreshTokens[0].tokenHash
      );
      expect(matches).toBe(true);
    });

    it('should revoke previous refresh token on new sign-in', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'user@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/sign-in')
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

    it('should use short expiration when rememberMe is false', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const beforeSignIn = new Date();

      await request(app.getHttpServer())
        .post('/sign-in')
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
        beforeSignIn.getTime() + 86400 * 1000
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
        .post('/sign-in')
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
        beforeSignIn.getTime() + 2592000 * 1000
      );

      expect(refreshToken!.expiredAt.getTime()).toBeLessThanOrEqual(
        expectedExpiration.getTime() + 5000
      );
      expect(refreshToken!.expiredAt.getTime()).toBeGreaterThanOrEqual(
        expectedExpiration.getTime() - 5000
      );
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/sign-in')
        .send({
          email: 'User@Example.COM',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
    });
  });
});
