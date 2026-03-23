import { INestApplication } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { MFA_AUTH_COOLDOWN_SEC, MFA_AUTH_MAX_ATTEMPTS } from '../../../src/config/constants';
import { DateTime } from 'luxon';
import { AuthFailureReason, SignInAttemptEntity } from '../../../src/entity/sign-in-attempt.entity';
import { TrustedDeviceEntity } from '../../../src/entity/trusted-device.entity';
import { LockReason, UserEntity } from '../../../src/entity/user.entity';
import { resetTestState, resetThrottler, consumeEmailQueue, getTestApp } from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createTrustedDevice, FAKE_DEVICE_FINGERPRINT } from '../utils/create-trusted-device';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { createTwoFactorAuth } from '../utils/create-two-factor-auth';
import { getAuthSession } from '../utils/get-auth-session';

// Validates a TOTP code for MFA within an existing auth session.
// Requires primary auth to be completed first.
describe('POST /auth/sign-in/mfa/totp/validate', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 20_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when sessionId is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ code: '123456' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when code is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'some-id' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be longer than or equal to 6 characters',
        'code should not be empty',
        'code must be a string'
      ]);
    });

    it('should return 400 when code is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'some-id', code: '123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be longer than or equal to 6 characters'
      ]);
    });

    it('should return 400 when code is too long', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'some-id', code: '1234567' })
        .expect(400);

      expect(response.body.message).toEqual([
        'code must be shorter than or equal to 6 characters'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string',
        'code must be longer than or equal to 6 characters',
        'code should not be empty',
        'code must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'non-existent', code: '123456' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 401 when primary auth is not completed', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app, { userId: user.id });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code: '123456' })
        .expect(401);

      expect(response.body.message).toBe('Primary authentication required');

      // Session should remain unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.mfaVerified).toBe(false);
    });

    it('should return 401 when TOTP code is invalid', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTwoFactorAuth(dataSource, user, true);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code: '000000' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Session should remain unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.mfaVerified).toBe(false);

      // Verify sign-in attempt is recorded
      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } } });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(false);
      expect(attempts[0].failureReason).toBe(AuthFailureReason.InvalidMfaAuth);
    });

    it('should return 200 with nextStep complete after valid TOTP code', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code })
        .expect(200);

      expect(response.body.sessionId).toBe(session.id);
      expect(response.body.nextStep).toBe('complete');

      // Verify the session is updated in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.mfaVerified).toBe(true);
      expect(redisSession!.exchanged).toBe(false);

      // Verify sign-in attempt is recorded
      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } } });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(true);
      expect(attempts[0].failureReason).toBeNull();
    });

    it('should trust the device when trustThisDevice is true', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const device = await createTrustedDevice(dataSource, user);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true,
        deviceFingerprint: FAKE_DEVICE_FINGERPRINT
      });

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code, trustThisDevice: true })
        .expect(200);

      const updatedDevice = await dataSource
        .getRepository(TrustedDeviceEntity)
        .findOneBy({ id: device.id });

      expect(updatedDevice!.trusted).toBe(true);
      expect(updatedDevice!.trustedUntil).toBeDefined();
      expect(new Date(updatedDevice!.trustedUntil).getTime()).toBeGreaterThan(Date.now());

      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession!.deviceTrusted).toBe(true);
    });

    it('should not trust the device when trustThisDevice is false', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const device = await createTrustedDevice(dataSource, user);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true,
        deviceFingerprint: FAKE_DEVICE_FINGERPRINT
      });

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code, trustThisDevice: false })
        .expect(200);

      const updatedDevice = await dataSource
        .getRepository(TrustedDeviceEntity)
        .findOneBy({ id: device.id });

      expect(updatedDevice!.trusted).toBe(false);
    });

    it('should not trust the device when trustThisDevice is omitted', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const device = await createTrustedDevice(dataSource, user);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true,
        deviceFingerprint: FAKE_DEVICE_FINGERPRINT
      });

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code })
        .expect(200);

      const updatedDevice = await dataSource
        .getRepository(TrustedDeviceEntity)
        .findOneBy({ id: device.id });

      expect(updatedDevice!.trusted).toBe(false);
    });

    it('should not trust the device when session has no deviceFingerprint', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);
      const device = await createTrustedDevice(dataSource, user);
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code, trustThisDevice: true })
        .expect(200);

      const updatedDevice = await dataSource
        .getRepository(TrustedDeviceEntity)
        .findOneBy({ id: device.id });

      expect(updatedDevice!.trusted).toBe(false);
    });
  });

  describe('temporary lock', () => {
    it(`should return 429 after ${MFA_AUTH_MAX_ATTEMPTS} failed TOTP attempts`, async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTwoFactorAuth(dataSource, user, true);

      for (let i = 0; i < MFA_AUTH_MAX_ATTEMPTS; i++) {
        const session = await createAuthSession(app, {
          userId: user.id,
          primaryAuthVerified: true
        });

        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/mfa/totp/validate')
          .set('X-Forwarded-For', `10.0.${i}.1`)
          .send({ sessionId: session.id, code: '000000' })
          .expect(401);
      }

      resetThrottler();
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code: '000000' })
        .expect(429);

      expect(response.body.message).toBe('Too many attempts, try again later');

      // Verify sign-in attempts: N failed (InvalidMfaAuth) + 1 too-many
      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } }, order: { createdAt: 'ASC' } });

      expect(attempts).toHaveLength(MFA_AUTH_MAX_ATTEMPTS + 1);

      for (let i = 0; i < MFA_AUTH_MAX_ATTEMPTS; i++) {
        expect(attempts[i].success).toBe(false);
        expect(attempts[i].failureReason).toBe(AuthFailureReason.InvalidMfaAuth);
      }

      expect(attempts[MFA_AUTH_MAX_ATTEMPTS].success).toBe(false);
      expect(attempts[MFA_AUTH_MAX_ATTEMPTS].failureReason).toBe(AuthFailureReason.TooManyMfaAttempts);
    });

    it('should reset the attempt counter after a successful TOTP validation', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);

      // Fail a few times (below threshold)
      for (let i = 0; i < MFA_AUTH_MAX_ATTEMPTS - 1; i++) {
        const session = await createAuthSession(app, {
          userId: user.id,
          primaryAuthVerified: true
        });

        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/mfa/totp/validate')
          .set('X-Forwarded-For', `10.0.${i}.1`)
          .send({ sessionId: session.id, code: '000000' })
          .expect(401);
      }

      // Successful validation resets the counter
      resetThrottler();
      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code })
        .expect(200);

      // Can fail again without being locked
      for (let i = 0; i < MFA_AUTH_MAX_ATTEMPTS - 1; i++) {
        const s = await createAuthSession(app, {
          userId: user.id,
          primaryAuthVerified: true
        });

        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/mfa/totp/validate')
          .set('X-Forwarded-For', `10.1.${i}.1`)
          .send({ sessionId: s.id, code: '000000' })
          .expect(401);
      }

      // Still not locked
      resetThrottler();
      const s = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const newCode = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: s.id, code: newCode })
        .expect(200);
    });

    it('should not permanently lock the user after many MFA failures', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTwoFactorAuth(dataSource, user, true);

      // Do 3 batches of MFA_AUTH_MAX_ATTEMPTS, simulating cooldown expiry between batches
      for (let batch = 0; batch < 3; batch++) {
        if (batch > 0) {
          // Simulate cooldown expiry
          await dataSource.getRepository(UserEntity).update(user.id, {
            mfaLastFailedAttemptAt: DateTime.utc()
              .minus({ seconds: MFA_AUTH_COOLDOWN_SEC + 1 })
              .toJSDate()
          });
        }

        for (let i = 0; i < MFA_AUTH_MAX_ATTEMPTS; i++) {
          resetThrottler();
          const session = await createAuthSession(app, {
            userId: user.id,
            primaryAuthVerified: true
          });

          await request(app.getHttpServer())
            .post('/api/v1/auth/sign-in/mfa/totp/validate')
            .set('X-Forwarded-For', `10.${batch}.${i}.1`)
            .send({ sessionId: session.id, code: '000000' });
        }
      }

      // User should NOT be permanently locked
      const dbUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(dbUser!.isLocked).toBe(false);
      expect(dbUser!.lockReason).toBeNull();
    });

    it('should return 401 when user is permanently locked for another reason', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTwoFactorAuth(dataSource, user, true);

      await dataSource.getRepository(UserEntity).update(user.id, {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: LockReason.SuspiciousActivity
      });

      const session = await createAuthSession(app, {
        userId: user.id,
        primaryAuthVerified: true
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: session.id, code: '000000' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Verify sign-in attempt is recorded with AccountLocked reason
      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } } });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(false);
      expect(attempts[0].failureReason).toBe(AuthFailureReason.AccountLocked);
    });
  });

  // Three-dimensional rate limiting.
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/mfa/totp/validate')
          .send({ sessionId: 'fake-id', code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'fake-id', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/mfa/totp/validate')
          .send({ sessionId: `fake-id-${i}`, code: '000000' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/mfa/totp/validate')
        .send({ sessionId: 'fake-id-final', code: '000000' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
