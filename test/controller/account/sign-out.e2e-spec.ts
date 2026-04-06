import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../../src/entity/refresh-token.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { createRefreshToken } from '../utils/create-refresh-token';
import { signTestJwt } from '../utils/sign-jwt';

// POST /account/sign-out — revokes the session (refresh token family) associated with the current JWT.
describe('POST /account/sign-out', () => {
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
        .post('/api/v1/account/sign-out')
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });

    it('should return 401 when token is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/sign-out')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired access token');
    });
  });

  describe('behavior', () => {
    it('should return 200 and revoke only the refresh token matching the JWT', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const jwt = signTestJwt({ sub: user.id, email: user.email });
      await createRefreshToken(dataSource, user, { jwt });

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/sign-out')
        .set('Authorization', `Bearer ${jwt}`)
        .expect(200);

      expect(response.body.message).toBe('Signed out');

      const tokens = await dataSource.getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(tokens).toHaveLength(1);
      expect(tokens[0].revoked).toBe(true);
    });

    it('should not revoke refresh tokens associated with a different JWT', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const jwt1 = signTestJwt({ sub: user.id, email: user.email });
      const jwt2 = signTestJwt({ sub: user.id, email: user.email });
      await createRefreshToken(dataSource, user, { jwt: jwt1 });
      await createRefreshToken(dataSource, user, { jwt: jwt2 });

      await request(app.getHttpServer())
        .post('/api/v1/account/sign-out')
        .set('Authorization', `Bearer ${jwt1}`)
        .expect(200);

      const tokens = await dataSource.getRepository(RefreshTokenEntity)
        .find({ where: { user: { id: user.id } } });

      expect(tokens).toHaveLength(2);

      const revokedToken = tokens.find((t) => t.jwt === jwt1);
      const activeToken = tokens.find((t) => t.jwt === jwt2);

      expect(revokedToken!.revoked).toBe(true);
      expect(activeToken!.revoked).toBe(false);
    });

    it('should return 200 even when no matching refresh token exists', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .post('/api/v1/account/sign-out')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe('Signed out');
    });
  });
});
