import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { MfaPolicy } from '../../../src/redis-model/auth-session.model';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { getAuthSession } from '../utils/get-auth-session';
import { getDefaultTenant } from '../utils/get-default-tenant';

// Creates a new auth session. Returns sessionId and nextStep: 'primaryAuth'.
describe('POST /auth/sign-in', () => {
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

  describe('behavior', () => {
    it('should return 201 with sessionId and nextStep primaryAuth', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in')
        .expect(201);

      expect(response.body.sessionId).toBeDefined();
      expect(typeof response.body.sessionId).toBe('string');
      expect(response.body.nextStep).toBe('primaryAuth');

      // Verify the session exists in Redis with correct initial state
      const session = await getAuthSession(app, response.body.sessionId);

      const tenant = await getDefaultTenant(dataSource);

      expect(session).not.toBeNull();
      expect(session!.tenantId).toBe(tenant.id);
      expect(session!.mode).toBe('first-party');
      expect(session!.userId).toBeUndefined();
      expect(session!.primaryAuthVerified).toBe(false);
      expect(session!.rememberMe).toBe(false);
      expect(session!.mfaPolicy).toBe(MfaPolicy.Disabled);
      expect(session!.mfaSetup).toBe(false);
      expect(session!.mfaVerified).toBe(false);
      expect(session!.deviceTrusted).toBe(false);
      expect(session!.exchanged).toBe(false);
      expect(session!.createdAt).toBeDefined();
      expect(session!.expiresAt).toBeDefined();
    });
  });
});
