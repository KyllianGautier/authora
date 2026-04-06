import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AuthoraSetting } from '../../../src/config/settings';
import { testAuthoraConfig } from '../../../src/config/authora-config';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';

const BASE = '/api/v1/admin';

async function signInAsSuperAdmin(app: INestApplication<App>): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`${BASE}/sign-in`)
    .send({ username: 'changeit', password: 'changeit' });

  return res.body.accessToken;
}

// Returns all AuthoraConfig values. Protected by SuperAdminGuard.
describe('GET /admin/settings', () => {
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
        .get(`${BASE}/settings`)
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });

    it('should return 401 when token is invalid', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/settings`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired super admin token');
    });
  });

  describe('behavior', () => {
    it('should return 200 with all authora settings', async () => {
      const token = await signInAsSuperAdmin(app);

      const response = await request(app.getHttpServer())
        .get(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.hashMemoryCost).toBe(testAuthoraConfig.hashMemoryCost);
      expect(response.body.hashTimeCost).toBe(testAuthoraConfig.hashTimeCost);
      expect(response.body.hashParallelism).toBe(testAuthoraConfig.hashParallelism);
      expect(response.body.throttleTtlMs).toBe(testAuthoraConfig.throttleTtlMs);
      expect(response.body.authSessionTtlSec).toBe(testAuthoraConfig.authSessionTtlSec);
      expect(response.body.ottExchangeTtlSec).toBe(testAuthoraConfig.ottExchangeTtlSec);
      expect(response.body.superAdminJwtExpirationSec).toBe(testAuthoraConfig.superAdminJwtExpirationSec);
    });
  });
});

// Updates a single AuthoraConfig value. Protected by SuperAdminGuard.
describe('POST /admin/settings', () => {
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
        .post(`${BASE}/settings`)
        .send({ key: AuthoraSetting.AuthSessionTtlSec, value: 300 })
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });

    it('should return 400 when key is invalid', async () => {
      const token = await signInAsSuperAdmin(app);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: 'invalidKey', value: 123 })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('key')])
      );
    });

    it('should return 400 when value is missing', async () => {
      const token = await signInAsSuperAdmin(app);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: AuthoraSetting.AuthSessionTtlSec })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('value')])
      );
    });

    it('should return 400 when body is empty', async () => {
      const token = await signInAsSuperAdmin(app);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(response.body.message.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('behavior', () => {
    it('should return 200 and update the setting', async () => {
      const token = await signInAsSuperAdmin(app);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: AuthoraSetting.AuthSessionTtlSec, value: 1200 })
        .expect(200);

      expect(response.body.message).toBe('Setting updated');

      const getRes = await request(app.getHttpServer())
        .get(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.authSessionTtlSec).toBe(1200);
    });
  });
});
