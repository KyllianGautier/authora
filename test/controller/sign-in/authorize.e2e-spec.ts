import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { IntegrationMode } from '../../../src/entity/tenant.entity';
import { MfaPolicy } from '../../../src/redis-model/auth-session.model';
import { resetTestState, consumeEmailQueue, getTestApp } from '../../setup';
import { getAuthSession } from '../utils/get-auth-session';
import { getDefaultTenant } from '../utils/get-default-tenant';

// GET /auth/sign-in/authorize — creates a third-party auth session (OAuth/PKCE).
describe('GET /auth/sign-in/authorize', () => {
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
    it('should return 400 when redirectUri is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/authorize')
        .query({ codeChallenge: 'abc123', codeChallengeMethod: 'S256' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['redirectUri must be a URL address'])
      );
    });

    it('should return 400 when codeChallenge is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/authorize')
        .query({ redirectUri: 'https://example.com/callback', codeChallengeMethod: 'S256' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['codeChallenge should not be empty'])
      );
    });

    it('should return 400 when codeChallengeMethod is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/authorize')
        .query({ redirectUri: 'https://example.com/callback', codeChallenge: 'abc123' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['codeChallengeMethod should not be empty'])
      );
    });

    it('should return 400 when query is empty', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/authorize')
        .expect(400);

      expect(response.body.message.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('behavior', () => {
    it('should return 201 with sessionId and nextStep primaryAuth', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/authorize')
        .query({
          redirectUri: 'https://example.com/callback',
          codeChallenge: 'abc123',
          codeChallengeMethod: 'S256'
        })
        .expect(201);

      expect(response.body.sessionId).toBeDefined();
      expect(typeof response.body.sessionId).toBe('string');
      expect(response.body.nextStep).toBe('primaryAuth');
    });

    it('should store the session in Redis with correct third-party state', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sign-in/authorize')
        .query({
          redirectUri: 'https://example.com/callback',
          codeChallenge: 'abc123',
          codeChallengeMethod: 'S256'
        })
        .expect(201);

      const session = await getAuthSession(app, response.body.sessionId);
      const tenant = await getDefaultTenant(dataSource);

      expect(session).not.toBeNull();
      expect(session!.tenantId).toBe(tenant.id);
      expect(session!.mode).toBe(IntegrationMode.ThirdParty);
      expect(session!.redirectUri).toBe('https://example.com/callback');
      expect(session!.codeChallenge).toBe('abc123');
      expect(session!.primaryAuthVerified).toBe(false);
      expect(session!.rememberMe).toBe(false);
      expect(session!.mfaPolicy).toBe(MfaPolicy.Disabled);
      expect(session!.exchanged).toBe(false);
    });
  });
});
