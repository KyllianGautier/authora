import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TenantSetting } from '../../../src/config/settings';
import { testTenantConfig } from '../../../src/config/tenant-config';
import { UserRole } from '../../../src/entity/user.entity';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { signTestJwt } from '../utils/sign-jwt';

const BASE = '/api/v1/tenant-admin';

async function createAdminToken(dataSource: DataSource): Promise<string> {
  const user = await createUserWithPassword(dataSource, 'admin@example.com', 'password123');
  await dataSource.getRepository('UserEntity').update(user.id, { role: UserRole.Admin });
  return signTestJwt({ sub: user.id, email: user.email });
}

async function createUserToken(dataSource: DataSource): Promise<string> {
  const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
  return signTestJwt({ sub: user.id, email: user.email });
}

// Returns all TenantConfig values for the current tenant. Protected by JwtAuthGuard + AdminGuard.
describe('GET /tenant-admin/settings', () => {
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

      expect(response.body.message).toBe('Invalid or expired access token');
    });

    it('should return 403 when user is not an admin', async () => {
      const token = await createUserToken(dataSource);

      const response = await request(app.getHttpServer())
        .get(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.message).toBe('Admin access required');
    });
  });

  describe('behavior', () => {
    it('should return 200 with all tenant settings', async () => {
      const token = await createAdminToken(dataSource);

      const response = await request(app.getHttpServer())
        .get(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.jwtAccessTokenExpirationSec).toBe(testTenantConfig.jwtAccessTokenExpirationSec);
      expect(response.body.primaryAuthMaxAttempts).toBe(testTenantConfig.primaryAuthMaxAttempts);
      expect(response.body.mfaPolicy).toBe(testTenantConfig.mfaPolicy);
      expect(response.body.passwordMinLength).toBe(testTenantConfig.passwordMinLength);
      expect(response.body.integrationMode).toBeDefined();
      expect(response.body.authoraUiBaseUrl).toBeDefined();
    });
  });
});

// Updates a single TenantConfig value. Protected by JwtAuthGuard + AdminGuard.
describe('POST /tenant-admin/settings', () => {
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
        .send({ key: TenantSetting.PasswordMinLength, value: 12 })
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });

    it('should return 403 when user is not an admin', async () => {
      const token = await createUserToken(dataSource);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: TenantSetting.PasswordMinLength, value: 12 })
        .expect(403);

      expect(response.body.message).toBe('Admin access required');
    });

    it('should return 400 when key is invalid', async () => {
      const token = await createAdminToken(dataSource);

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
      const token = await createAdminToken(dataSource);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: TenantSetting.PasswordMinLength })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('value')])
      );
    });

    it('should return 400 when body is empty', async () => {
      const token = await createAdminToken(dataSource);

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
      const token = await createAdminToken(dataSource);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: TenantSetting.PasswordMinLength, value: 16 })
        .expect(200);

      expect(response.body.message).toBe('Setting updated');

      const getRes = await request(app.getHttpServer())
        .get(`${BASE}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.passwordMinLength).toBe(16);
    });
  });
});
