import { INestApplication } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TwoFactorAuthEntity } from '../../src/entity/two-factor-auth.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';

describe('POST /2fa/disable', () => {
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

  function generateTotpCode(secret: string): string {
    return speakeasy.totp({
      secret,
      encoding: 'base32'
    });
  }

  async function setupAndVerify2fa(
    email: string,
    password: string
  ): Promise<string> {
    const setupResponse = await request(app.getHttpServer())
      .post('/2fa/setup')
      .send({ email, password })
      .expect(200);

    const secret = setupResponse.body.manualCode;
    const code = generateTotpCode(secret);

    await request(app.getHttpServer())
      .post('/2fa/verify')
      .send({ email, password, code })
      .expect(200);

    return secret;
  }

  describe('validation', () => {
    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ password: 'password123', code: '123456' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'not-an-email',
          password: 'password123',
          code: '123456'
        })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'user@example.com', code: '123456' })
        .expect(400);
    });

    it('should return 400 when password is empty', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'user@example.com', password: '', code: '123456' })
        .expect(400);
    });

    it('should return 400 when code is missing', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when code is too short', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123'
        })
        .expect(400);
    });

    it('should return 400 when code is too long', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '1234567'
        })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/2fa/disable')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'unknown@example.com',
          password: 'password123',
          code: '123456'
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
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'wrongPassword',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when no two-factor auth exists', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when two-factor auth is set up but not verified', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const setupResponse = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const code = generateTotpCode(setupResponse.body.manualCode);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when verification code is invalid', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await setupAndVerify2fa('user@example.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '000000'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 and remove two-factor auth on valid request', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const secret = await setupAndVerify2fa(
        'user@example.com',
        'password123'
      );

      const code = generateTotpCode(secret);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.message).toBe(
        'Two-factor authentication disabled'
      );

      // Two-factor auth should be removed from the database
      const twoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      expect(twoFactorAuth).toBeNull();
    });

    it('should return 401 when two-factor auth is already disabled', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const secret = await setupAndVerify2fa(
        'user@example.com',
        'password123'
      );

      const code = generateTotpCode(secret);

      await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      // Second disable attempt should return 401
      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should allow re-setup after disabling', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const secret = await setupAndVerify2fa(
        'user@example.com',
        'password123'
      );

      const code = generateTotpCode(secret);

      await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      // Should be able to set up 2FA again
      await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const secret = await setupAndVerify2fa(
        'user@example.com',
        'password123'
      );

      const code = generateTotpCode(secret);

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({
          email: 'User@Example.COM',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.message).toBe(
        'Two-factor authentication disabled'
      );
    });
  });

  describe('throttling', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/2fa/disable')
          .send({ email: 'throttle@example.com', password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/2fa/disable')
        .send({ email: 'throttle@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
    });
  });
});
