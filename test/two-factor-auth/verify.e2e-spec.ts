import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TwoFactorAuthEntity } from '../../src/entity/two-factor-auth.entity';
import { resetTestState, consumeEmailQueue, getTestApp } from '../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';

describe('POST /2fa/verify', () => {
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

  describe('validation', () => {
    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({ password: 'password123', code: '123456' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({
          email: 'not-an-email',
          password: 'password123',
          code: '123456'
        })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({ email: 'user@example.com', code: '123456' })
        .expect(400);
    });

    it('should return 400 when password is empty', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({ email: 'user@example.com', password: '', code: '123456' })
        .expect(400);
    });

    it('should return 400 when code is missing', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when code is too short', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123'
        })
        .expect(400);
    });

    it('should return 400 when code is too long', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '1234567'
        })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/2fa/verify')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/2fa/verify')
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
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'wrongPassword',
          code: '123456'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 404 when no two-factor auth setup exists', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '123456'
        })
        .expect(404);

      expect(response.body.message).toBe(
        'Two-factor authentication setup not found'
      );
    });

    it('should return 401 when verification code is invalid', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: '000000'
        })
        .expect(401);

      expect(response.body.message).toBe(
        'Two-factor authentication code is invalid'
      );
    });

    it('should enable two-factor auth and return recovery codes on valid code', async () => {
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
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      // Should return 10 recovery codes
      expect(response.body.recoveryCodes).toHaveLength(10);

      // Each recovery code should be 6 digits
      for (const recoveryCode of response.body.recoveryCodes) {
        expect(recoveryCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      }

      // Two-factor auth should be enabled in the database
      const twoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      expect(twoFactorAuth).not.toBeNull();
      expect(twoFactorAuth!.isEnabled).toBe(true);
      expect(twoFactorAuth!.recoveryCodeHashes).toHaveLength(10);
    });

    it('should store recovery codes as hashes', async () => {
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
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      const twoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      // Each returned recovery code should match the corresponding hash
      const clearCodes = response.body.recoveryCodes as string[];
      for (let i = 0; i < clearCodes.length; i++) {
        const matches = await bcrypt.compare(
          clearCodes[i],
          twoFactorAuth!.recoveryCodeHashes[i]
        );
        expect(matches).toBe(true);
      }
    });

    it('should complete the full setup and verify flow', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      // Setup 2FA
      const setupResponse = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(setupResponse.body.qrcode).toMatch(/^data:image\/png;base64,/);
      expect(setupResponse.body.manualCode).toBeDefined();

      // Generate a TOTP code from the secret
      const code = generateTotpCode(setupResponse.body.manualCode);

      // Verify 2FA with the code
      const response = await request(app.getHttpServer())
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.recoveryCodes).toHaveLength(10);

      // 2FA should now be enabled
      const twoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      expect(twoFactorAuth!.isEnabled).toBe(true);
      expect(twoFactorAuth!.recoveryCodeHashes).toHaveLength(10);
    });

    it('should reject the old secret code after re-setup', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      // First setup
      const firstSetup = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const oldCode = generateTotpCode(firstSetup.body.manualCode);

      // Second setup (new secret)
      await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      // The old code should no longer work
      const response = await request(app.getHttpServer())
        .post('/2fa/verify')
        .send({
          email: 'user@example.com',
          password: 'password123',
          code: oldCode
        })
        .expect(401);

      expect(response.body.message).toBe(
        'Two-factor authentication code is invalid'
      );
    });

    it('should normalize email to lowercase', async () => {
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
        .post('/2fa/verify')
        .send({
          email: 'User@Example.COM',
          password: 'password123',
          code
        })
        .expect(200);

      expect(response.body.recoveryCodes).toHaveLength(10);
    });
  });

  describe('throttling', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/2fa/verify')
          .send({ email: 'throttle@example.com', password: 'password123', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/2fa/verify')
        .send({ email: 'throttle@example.com', password: 'password123', code: '000000' });

      expect(response.status).toBe(429);
    });
  });
});
