import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { getAuthSession } from '../utils/get-auth-session';

// Creates a new auth session. Returns sessionId and nextStep: 'primaryAuth'.
describe('POST /auth/sign-in-2', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await getTestApp();
  }, 120_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when tenantId is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in-2')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'tenantId should not be empty',
        'tenantId must be a string'
      ]);
    });

    it('should return 400 when tenantId is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in-2')
        .send({ tenantId: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'tenantId should not be empty'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 201 with sessionId and nextStep primaryAuth', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in-2')
        .send({ tenantId: 'default' })
        .expect(201);

      expect(response.body.sessionId).toBeDefined();
      expect(typeof response.body.sessionId).toBe('string');
      expect(response.body.nextStep).toBe('primaryAuth');

      // Verify the session exists in Redis with correct initial state
      const session = await getAuthSession(app, response.body.sessionId);

      expect(session).not.toBeNull();
      expect(session!.tenantId).toBe('default');
      expect(session!.mode).toBe('first-party');
      expect(session!.userId).toBeUndefined();
      expect(session!.primaryAuthVerified).toBe(false);
      expect(session!.rememberMe).toBe(false);
      expect(session!.mfaPolicy).toBe('DISABLED');
      expect(session!.mfaSetup).toBe(false);
      expect(session!.mfaVerified).toBe(false);
      expect(session!.deviceTrusted).toBe(false);
      expect(session!.createdAt).toBeDefined();
      expect(session!.expiresAt).toBeDefined();
    });
  });
});
