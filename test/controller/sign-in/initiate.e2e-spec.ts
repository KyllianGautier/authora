import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { IntegrationMode } from '../../../src/entity/tenant.entity';
import { MfaPolicy } from '../../../src/redis-model/auth-session.model';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { getAuthSession } from '../utils/get-auth-session';
import { getDefaultTenant } from '../utils/get-default-tenant';

// POST /auth/sign-in/initiate — creates a first-party auth session.
// Requires X-Device-Fingerprint cookie.
describe('POST /auth/sign-in/initiate', () => {
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
    it('should return 400 when X-Device-Fingerprint cookie is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/initiate')
        .expect(400);

      expect(response.body.message).toBe('Missing X-Device-Fingerprint cookie');
    });
  });

  describe('behavior', () => {
    it('should return 201 with sessionId and nextStep primaryAuth', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/initiate')
        .set('Cookie', 'X-Device-Fingerprint=test-fingerprint')
        .expect(201);

      expect(response.body.sessionId).toBeDefined();
      expect(typeof response.body.sessionId).toBe('string');
      expect(response.body.nextStep).toBe('primaryAuth');
    });

    it('should store the session in Redis with correct initial state', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/initiate')
        .set('Cookie', 'X-Device-Fingerprint=test-fingerprint')
        .expect(201);

      const session = await getAuthSession(app, response.body.sessionId);
      const tenant = await getDefaultTenant(dataSource);

      expect(session).not.toBeNull();
      expect(session!.tenantId).toBe(tenant.id);
      expect(session!.mode).toBe(IntegrationMode.FirstParty);
      expect(session!.deviceFingerprint).toBe('test-fingerprint');
      expect(session!.userId).toBeUndefined();
      expect(session!.primaryAuthVerified).toBe(false);
      expect(session!.rememberMe).toBe(false);
      expect(session!.mfaPolicy).toBe(MfaPolicy.Disabled);
      expect(session!.mfaSetup).toBe(false);
      expect(session!.mfaVerified).toBe(false);
      expect(session!.deviceTrusted).toBe(false);
      expect(session!.exchanged).toBe(false);
    });
  });
});
