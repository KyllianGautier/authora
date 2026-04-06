import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { createRefreshToken } from '../utils/create-refresh-token';
import { signTestJwt } from '../utils/sign-jwt';

const BASE = '/api/v1/account';

// GET /account/session — lists all active sessions (refresh tokens) for the authenticated user.
describe('GET /account/session', () => {
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
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/session`)
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });

    it('should return 401 when token is invalid', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/session`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired access token');
    });
  });

  describe('behavior', () => {
    it('should return 200 with an empty list when user has no sessions', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/session`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return 200 with the list of active sessions', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createRefreshToken(dataSource, user);
      await createRefreshToken(dataSource, user);
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/session`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].id).toBeDefined();
      expect(response.body[0].family).toBeDefined();
      expect(response.body[0].expiredAt).toBeDefined();
      expect(response.body[0].createdAt).toBeDefined();
    });

    it('should not return revoked sessions', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const rt = await createRefreshToken(dataSource, user);
      await dataSource.getRepository(RefreshTokenEntity).update(rt.id, { revoked: true });
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/session`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});

// POST /account/session/revoke-all — revokes all active sessions for the authenticated user.
describe('POST /account/session/revoke-all', () => {
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
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/session/revoke-all`)
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });
  });

  describe('behavior', () => {
    it('should return 200 and revoke all active sessions', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createRefreshToken(dataSource, user);
      await createRefreshToken(dataSource, user);
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .post(`${BASE}/session/revoke-all`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe('All sessions revoked');

      const tokens = await dataSource.getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(tokens).toHaveLength(2);
      expect(tokens.every((t) => t.revoked)).toBe(true);
    });

    it('should return 200 even when no active sessions exist', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .post(`${BASE}/session/revoke-all`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe('All sessions revoked');
    });
  });
});
