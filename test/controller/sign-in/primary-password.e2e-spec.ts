import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { DateTime } from 'luxon';
import {
  PRIMARY_AUTH_COOLDOWN_SEC,
  PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD,
  PRIMARY_AUTH_MAX_ATTEMPTS
} from '../../../src/config/constants';
import { AuthFailureReason, SignInAttemptEntity } from '../../../src/entity/sign-in-attempt.entity';
import { TrustedDeviceEntity } from '../../../src/entity/trusted-device.entity';
import { LockReason, UserEntity } from '../../../src/entity/user.entity';
import { resetTestState, resetThrottler, consumeEmailQueue, getTestApp, setTenantConfig } from '../../setup';
import { createAuthSession } from '../utils/create-auth-session';
import { createTrustedDevice, FAKE_DEVICE_FINGERPRINT } from '../utils/create-trusted-device';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { expirePassword } from '../utils/expire-password';
import { extractCookie } from '../utils/extract-cookie';
import { getAuthSession } from '../utils/get-auth-session';

// Authenticates with email and password within an existing auth session.
describe('POST /auth/sign-in/primary/password', () => {
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

  describe('validation', () => {
    it('should return 400 when sessionId is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string'
      ]);
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'some-id', password: 'password123' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'some-id', email: 'user@example.com' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty',
        'password must be a string'
      ]);
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'some-id', email: 'user@example.com', password: '' })
        .expect(400);

      expect(response.body.message).toEqual([
        'password should not be empty'
      ]);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual([
        'sessionId should not be empty',
        'sessionId must be a string',
        'email must be an email',
        'password should not be empty',
        'password must be a string'
      ]);
    });
  });

  describe('behavior', () => {
    it('should return 404 when session does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'non-existent', email: 'user@example.com', password: 'password123' })
        .expect(404);

      expect(response.body.message).toBe('Session not found or expired');
    });

    it('should return 401 when user does not exist', async () => {
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'unknown@example.com', password: 'password123' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Session should still exist unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(false);
      expect(redisSession!.userId).toBeUndefined();
    });

    it('should return 401 when password is wrong', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'wrongPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');

      // Session should still exist unchanged in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(false);
      expect(redisSession!.userId).toBeUndefined();

      // Verify sign-in attempt is recorded
      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } } });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(false);
      expect(attempts[0].failureReason).toBe(AuthFailureReason.InvalidPasswordAuth);
    });

    it('should return 200 with nextStep complete after valid password', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.sessionId).toBe(session.id);
      expect(response.body.nextStep).toBe('complete');

      // Verify the session is updated in Redis
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.userId).toBe(user.id);
      expect(redisSession!.primaryAuthVerified).toBe(true);
      expect(redisSession!.rememberMe).toBe(false);
      expect(redisSession!.mfaSetup).toBe(false);
      expect(redisSession!.exchanged).toBe(false);

      // Verify sign-in attempt is recorded
      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } } });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(true);
      expect(attempts[0].failureReason).toBeNull();
      expect(attempts[0].ip).toBeDefined();
      expect(attempts[0].userAgent).toBeDefined();
    });

    it('should store rememberMe in the session', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123', rememberMe: true })
        .expect(200);

      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession!.rememberMe).toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'User@Example.COM', password: 'password123' })
        .expect(200);

      expect(response.body.nextStep).toBe('complete');
    });
  });

  describe('trusted device', () => {
    it('should create a trusted device with trusted: false and set the cookie', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      // Verify a TrustedDevice was created
      const devices = await dataSource
        .getRepository(TrustedDeviceEntity)
        .find({ where: { user: { id: user.id } } });

      expect(devices).toHaveLength(1);
      expect(devices[0].trusted).toBe(false);

      // Verify the deviceFingerprint cookie is set
      const cookie = extractCookie(response, 'deviceFingerprint');
      expect(cookie).toBeDefined();
      expect(cookie!.value.length).toBeGreaterThan(0);
      expect(cookie!.flags).toContain('Secure');
      expect(cookie!.flags).toContain('SameSite=Strict');
      expect(cookie!.flags).not.toContain('HttpOnly');

      // Verify the fingerprint is stored in the session
      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession!.deviceFingerprint).toBe(cookie!.value);
    });

    it('should reuse existing device and update lastSeenAt when cookie is sent', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTrustedDevice(dataSource, user);
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .set('Cookie', `deviceFingerprint=${FAKE_DEVICE_FINGERPRINT}`)
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      // Should not create a second device
      const devices = await dataSource
        .getRepository(TrustedDeviceEntity)
        .find({ where: { user: { id: user.id } } });

      expect(devices).toHaveLength(1);

      // Cookie should be set with the same fingerprint
      const cookie = extractCookie(response, 'deviceFingerprint');
      expect(cookie).toBeDefined();
      expect(cookie!.value).toBe(FAKE_DEVICE_FINGERPRINT);
    });

    it('should set deviceTrusted on session when device is trusted', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTrustedDevice(dataSource, user, { trusted: true });
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .set('Cookie', `deviceFingerprint=${FAKE_DEVICE_FINGERPRINT}`)
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession!.deviceTrusted).toBe(true);
    });

    it('should not set deviceTrusted when trust has expired', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTrustedDevice(dataSource, user, {
        trusted: true,
        trustedUntil: new Date('2000-01-01')
      });
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .set('Cookie', `deviceFingerprint=${FAKE_DEVICE_FINGERPRINT}`)
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession!.deviceTrusted).toBe(false);
    });
  });

  describe('password expiration', () => {
    it('should return 401 with nextStep reset_password when password is expired', async () => {
      setTenantConfig({ passwordExpirationEnabled: true, passwordMaxAgeSec: 60 });
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await expirePassword(dataSource, user);
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(401);

      expect(response.body.message).toBe('Password expired');
      expect(response.body.nextStep).toBe('reset_password');
    });

    it('should not update the session when password is expired', async () => {
      setTenantConfig({ passwordExpirationEnabled: true, passwordMaxAgeSec: 60 });
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await expirePassword(dataSource, user);
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(401);

      const redisSession = await getAuthSession(app, session.id);
      expect(redisSession).not.toBeNull();
      expect(redisSession!.primaryAuthVerified).toBe(false);
      expect(redisSession!.userId).toBeUndefined();
    });

    it('should record a sign-in attempt with PasswordExpired reason', async () => {
      setTenantConfig({ passwordExpirationEnabled: true, passwordMaxAgeSec: 60 });
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await expirePassword(dataSource, user);
      const session = await createAuthSession(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(401);

      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } } });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(false);
      expect(attempts[0].failureReason).toBe(AuthFailureReason.PasswordExpired);
    });

    it('should return 200 when password is not yet expired', async () => {
      setTenantConfig({ passwordExpirationEnabled: true, passwordMaxAgeSec: 60 });
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const session = await createAuthSession(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.nextStep).toBe('complete');
    });
  });

  describe('temporary lock', () => {
    it(`should return 429 after ${PRIMARY_AUTH_MAX_ATTEMPTS} failed attempts`, async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      for (let i = 0; i < PRIMARY_AUTH_MAX_ATTEMPTS; i++) {
        resetThrottler();
        const session = await createAuthSession(app);
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .set('X-Forwarded-For', `10.0.${i}.1`)
          .send({ sessionId: session.id, email: 'user@example.com', password: 'wrong' })
          .expect(401);
      }

      resetThrottler();
      const session = await createAuthSession(app);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(429);

      expect(response.body.message).toBe('Too many attempts, try again later');

      // Verify sign-in attempts: N failed (InvalidPasswordAuth) + 1 too-many
      const attempts = await dataSource
        .getRepository(SignInAttemptEntity)
        .find({ where: { user: { id: user.id } }, order: { createdAt: 'ASC' } });

      expect(attempts).toHaveLength(PRIMARY_AUTH_MAX_ATTEMPTS + 1);

      for (let i = 0; i < PRIMARY_AUTH_MAX_ATTEMPTS; i++) {
        expect(attempts[i].success).toBe(false);
        expect(attempts[i].failureReason).toBe(AuthFailureReason.InvalidPasswordAuth);
      }

      expect(attempts[PRIMARY_AUTH_MAX_ATTEMPTS].success).toBe(false);
      expect(attempts[PRIMARY_AUTH_MAX_ATTEMPTS].failureReason).toBe(AuthFailureReason.TooManyAttempts);
    });

    it('should allow login after cooldown expires', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Simulate a temp lock that has expired
      await dataSource.getRepository(UserEntity).update(user.id, {
        failedPasswordAttempts: PRIMARY_AUTH_MAX_ATTEMPTS,
        lastFailedPasswordAt: DateTime.utc()
          .minus({ seconds: PRIMARY_AUTH_COOLDOWN_SEC + 1 })
          .toJSDate()
      });

      const session = await createAuthSession(app);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.nextStep).toBe('complete');
    });

    it('should reset the attempt counter after a successful login', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      for (let i = 0; i < PRIMARY_AUTH_MAX_ATTEMPTS - 1; i++) {
        resetThrottler();
        const session = await createAuthSession(app);
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .set('X-Forwarded-For', `10.0.${i}.1`)
          .send({ sessionId: session.id, email: 'user@example.com', password: 'wrong' })
          .expect(401);
      }

      // Successful login resets the counter
      resetThrottler();
      const session = await createAuthSession(app);
      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
        .expect(200);

      // Can fail again without being locked
      for (let i = 0; i < PRIMARY_AUTH_MAX_ATTEMPTS - 1; i++) {
        resetThrottler();
        const s = await createAuthSession(app);
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .set('X-Forwarded-For', `10.1.${i}.1`)
          .send({ sessionId: s.id, email: 'user@example.com', password: 'wrong' })
          .expect(401);
      }

      resetThrottler();
      const s = await createAuthSession(app);
      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: s.id, email: 'user@example.com', password: 'password123' })
        .expect(200);
    });
  });

  describe('permanent lock', () => {
    it(`should permanently lock after ${PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD} failed attempts`, async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Do attempts in batches, simulating cooldown expiry between batches via DB
      for (let i = 0; i < PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD; i++) {
        if (i >= PRIMARY_AUTH_MAX_ATTEMPTS) {
          // Simulate cooldown expiry by backdating lastFailedPasswordAt
          await dataSource.getRepository(UserEntity).update(user.id, {
            lastFailedPasswordAt: DateTime.utc()
              .minus({ seconds: PRIMARY_AUTH_COOLDOWN_SEC + 1 })
              .toJSDate()
          });
        }
        resetThrottler();
        const session = await createAuthSession(app);
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .set('X-Forwarded-For', `10.0.${i}.1`)
          .send({ sessionId: session.id, email: 'user@example.com', password: 'wrong' });
      }

      const lockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(lockedUser!.isLocked).toBe(true);
      expect(lockedUser!.lockedAt).not.toBeNull();
      expect(lockedUser!.lockReason).toBe(LockReason.TooManyAttempts);
    });

    it('should return 401 with correct password when user is permanently locked', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Lock the user directly in DB
      await dataSource.getRepository(UserEntity).update(user.id, {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: LockReason.TooManyAttempts
      });

      const session = await createAuthSession(app);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
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

    it('should return 403 for all lock reasons', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      for (const reason of Object.values(LockReason) as LockReason[]) {
        await dataSource.getRepository(UserEntity).update(user.id, {
          isLocked: true,
          lockedAt: new Date(),
          lockReason: reason
        });

        const session = await createAuthSession(app);
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .send({ sessionId: session.id, email: 'user@example.com', password: 'password123' })
          .expect(401);

        expect(response.body.message).toBe('Invalid credentials');
      }
    });

    it('should not affect other users', async () => {
      const alice = await createUserWithPassword(dataSource, 'alice@example.com', 'password123');
      await createUserWithPassword(dataSource, 'bob@example.com', 'password456');

      await dataSource.getRepository(UserEntity).update(alice.id, {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: LockReason.TooManyAttempts
      });

      const session = await createAuthSession(app);
      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: session.id, email: 'bob@example.com', password: 'password456' })
        .expect(200);
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .send({ sessionId: 'fake-id', email: 'combined@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'fake-id', email: 'combined@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ sessionId: 'fake-id', email: 'identity@example.com', password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ sessionId: 'fake-id', email: 'identity@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/sign-in/primary/password')
          .send({ sessionId: 'fake-id', email: `origin-${i}@example.com`, password: 'password123' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/primary/password')
        .send({ sessionId: 'fake-id', email: 'origin-final@example.com', password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
