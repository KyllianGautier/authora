import { INestApplication } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { DateTime } from 'luxon';
import {
  MFA_AUTH_COOLDOWN_SEC,
  MFA_AUTH_MAX_ATTEMPTS,
  PRIMARY_AUTH_COOLDOWN_SEC,
  PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD,
  PRIMARY_AUTH_MAX_ATTEMPTS,
  TOKEN_REUSE_MAX_COMPROMISED_FAMILIES
} from '../../src/config/constants';
import { LockReason, UserEntity } from '../../src/entity/user.entity';
import {
  resetTestState,
  resetThrottler,
  consumeEmailQueue,
  getTestApp
} from '../setup';
import { createTwoFactorAuth } from '../controller/utils/create-two-factor-auth';
import { createUserWithPassword } from '../controller/utils/create-user-with-password';
import { extractCookie } from '../controller/utils/extract-cookie';

const BASE = '/api/v1/auth/sign-in';

// Helper: create a session and return its id
async function createSession(
  app: INestApplication<App>
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(BASE)
    .expect(201);

  return res.body.sessionId as string;
}

// Helper: attempt password login, return the response
async function attemptPassword(
  app: INestApplication<App>,
  sessionId: string,
  email: string,
  password: string
): Promise<request.Response> {
  return request(app.getHttpServer())
    .post(`${BASE}/primary/password`)
    .send({ sessionId, email, password });
}

// Helper: full sign-in flow → returns AT + RT
async function signIn(
  app: INestApplication<App>,
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string }> {
  resetThrottler();
  const sessionId = await createSession(app);

  await request(app.getHttpServer())
    .post(`${BASE}/primary/password`)
    .send({ sessionId, email, password })
    .expect(200);

  const exchangeRes = await request(app.getHttpServer())
    .post(`${BASE}/exchange`)
    .send({ sessionId })
    .expect(200);

  const tokenRes = await request(app.getHttpServer())
    .post(`${BASE}/token`)
    .send({ exchangeToken: exchangeRes.body.exchangeToken })
    .expect(200);

  return {
    accessToken: tokenRes.body.accessToken as string,
    refreshToken: extractCookie(tokenRes, 'refreshToken')!.value
  };
}

// Helper: trigger a single token reuse detection
async function triggerTokenReuse(
  app: INestApplication<App>,
  email: string,
  password: string
): Promise<void> {
  const { accessToken, refreshToken } = await signIn(app, email, password);

  resetThrottler();
  // Rotate the refresh token
  const refreshRes = await request(app.getHttpServer())
    .post(`${BASE}/token/refresh`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Cookie', `refreshToken=${refreshToken}`)
    .expect(200);

  const newAt = refreshRes.body.accessToken as string;

  // Replay the old (revoked) refresh token → triggers reuse detection
  await request(app.getHttpServer())
    .post(`${BASE}/token/refresh`)
    .set('Authorization', `Bearer ${newAt}`)
    .set('Cookie', `refreshToken=${refreshToken}`)
    .expect(401);
}

// Helper: fail N password attempts, simulating cooldown expiry via DB when needed.
// After PRIMARY_AUTH_MAX_ATTEMPTS, each attempt re-triggers the temp lock,
// so we backdate primaryLastFailedAttemptAt before every attempt beyond the threshold.
async function failPasswordAttempts(
  app: INestApplication<App>,
  dataSource: DataSource,
  email: string,
  count: number
): Promise<void> {
  for (let i = 0; i < count; i++) {
    if (i >= PRIMARY_AUTH_MAX_ATTEMPTS) {
      await dataSource.getRepository(UserEntity).update(
        { email },
        {
          primaryLastFailedAttemptAt: DateTime.utc()
            .minus({ seconds: PRIMARY_AUTH_COOLDOWN_SEC + 1 })
            .toJSDate()
        }
      );
    }
    resetThrottler();
    const sessionId = await createSession(app);
    await attemptPassword(app, sessionId, email, 'wrong');
  }
}

describe('Scenario: User lock workflows', () => {
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

  // ──────────────────────────────────────────────────
  // Password temporary lock persists across sign-in flows
  // ──────────────────────────────────────────────────

  describe('password temporary lock across sign-in flows', () => {
    it('should block password auth on a new sign-in after temporary lock', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Fail password to trigger temporary lock
      for (let i = 0; i < PRIMARY_AUTH_MAX_ATTEMPTS; i++) {
        resetThrottler();
        const sessionId = await createSession(app);
        await attemptPassword(app, sessionId, 'user@example.com', 'wrong');
      }

      // Start a completely new sign-in flow
      resetThrottler();
      const sessionId = await createSession(app);

      // Even with correct password, should still be temporarily locked
      const res = await attemptPassword(app, sessionId, 'user@example.com', 'password123');
      expect(res.status).toBe(429);
      expect(res.body.message).toBe('Too many attempts, try again later');
    });
  });

  // ──────────────────────────────────────────────────
  // Token reuse → account lock
  // ──────────────────────────────────────────────────

  describe('account lock after repeated token reuse', () => {
    it(`should lock the account and reject login after ${TOKEN_REUSE_MAX_COMPROMISED_FAMILIES} token reuse detections`, async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      for (let i = 0; i < TOKEN_REUSE_MAX_COMPROMISED_FAMILIES; i++) {
        await triggerTokenReuse(app, 'user@example.com', 'password123');
      }

      // Verify the user is locked in the database
      const lockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(lockedUser!.isLocked).toBe(true);
      expect(lockedUser!.lockedAt).not.toBeNull();
      expect(lockedUser!.lockReason).toBe(LockReason.SuspiciousActivity);

      // Login should be rejected with permanent lock
      resetThrottler();
      const sessionId = await createSession(app);
      const res = await attemptPassword(app, sessionId, 'user@example.com', 'password123');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should not lock when reuse count is below threshold and allow login', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      for (let i = 0; i < TOKEN_REUSE_MAX_COMPROMISED_FAMILIES - 1; i++) {
        await triggerTokenReuse(app, 'user@example.com', 'password123');
      }

      const notLockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });

      expect(notLockedUser!.isLocked).toBe(false);

      // Login should still work
      const sessionId = await createSession(app);
      const res = await attemptPassword(app, sessionId, 'user@example.com', 'password123');
      expect(res.status).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────
  // MFA temporary lock persists across sign-in flows
  // ──────────────────────────────────────────────────

  describe('MFA temporary lock across sign-in flows', () => {
    it('should block MFA validation on a new sign-in after temporary lock', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);

      // First sign-in: password OK, then fail MFA to trigger temporary lock
      resetThrottler();
      const session1 = await createSession(app);
      await attemptPassword(app, session1, 'user@example.com', 'password123');

      for (let i = 0; i < MFA_AUTH_MAX_ATTEMPTS; i++) {
        await request(app.getHttpServer())
          .post(`${BASE}/mfa/totp/validate`)
          .set('X-Forwarded-For', `10.0.${i}.1`)
          .send({ sessionId: session1, code: '000000' })
          .expect(401);
      }

      // Confirm temporarily locked on the same session
      resetThrottler();
      await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId: session1, code: '000000' })
        .expect(429);

      // Start a completely new sign-in flow
      resetThrottler();
      const session2 = await createSession(app);
      await request(app.getHttpServer())
        .post(`${BASE}/primary/password`)
        .send({ sessionId: session2, email: 'user@example.com', password: 'password123' })
        .expect(200);

      // MFA should still be temporarily locked
      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      const res = await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId: session2, code })
        .expect(429);

      expect(res.body.message).toBe('Too many attempts, try again later');
    });
  });

  // ──────────────────────────────────────────────────
  // Lock reason severity hierarchy
  // ──────────────────────────────────────────────────

  describe('lock reason severity hierarchy', () => {
    it('should not downgrade lockReason from SuspiciousActivity to TooManyAttempts', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Get tokens before locking
      const { accessToken, refreshToken } = await signIn(app, 'user@example.com', 'password123');

      // Trigger enough token reuse to lock with SuspiciousActivity
      for (let i = 0; i < TOKEN_REUSE_MAX_COMPROMISED_FAMILIES; i++) {
        await triggerTokenReuse(app, 'user@example.com', 'password123');
      }

      // Verify locked with SuspiciousActivity
      const lockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(lockedUser!.lockReason).toBe(LockReason.SuspiciousActivity);

      // Now trigger password permanent lock threshold
      await failPasswordAttempts(app, dataSource, 'user@example.com', PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD);

      // lockReason should still be SuspiciousActivity (not downgraded)
      const stillSuspicious = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(stillSuspicious!.isLocked).toBe(true);
      expect(stillSuspicious!.lockReason).toBe(LockReason.SuspiciousActivity);
    });

    it('should escalate lockReason from TooManyAttempts to SuspiciousActivity via token reuse', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // First: get some tokens while not locked
      const tokens: { accessToken: string; refreshToken: string }[] = [];
      for (let i = 0; i < TOKEN_REUSE_MAX_COMPROMISED_FAMILIES; i++) {
        tokens.push(await signIn(app, 'user@example.com', 'password123'));
      }

      // Lock with TooManyAttempts
      await failPasswordAttempts(app, dataSource, 'user@example.com', PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD);

      const lockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(lockedUser!.lockReason).toBe(LockReason.TooManyAttempts);

      // Trigger token reuse with previously obtained tokens
      for (const { accessToken, refreshToken } of tokens) {
        resetThrottler();
        // Rotate
        const refreshRes = await request(app.getHttpServer())
          .post(`${BASE}/token/refresh`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Cookie', `refreshToken=${refreshToken}`);

        if (refreshRes.status === 200) {
          const newAt = refreshRes.body.accessToken as string;
          await request(app.getHttpServer())
            .post(`${BASE}/token/refresh`)
            .set('Authorization', `Bearer ${newAt}`)
            .set('Cookie', `refreshToken=${refreshToken}`)
            .expect(401);
        }
      }

      // lockReason should be escalated to SuspiciousActivity
      const escalatedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(escalatedUser!.isLocked).toBe(true);
      expect(escalatedUser!.lockReason).toBe(LockReason.SuspiciousActivity);

      // Password reset should NOT unlock (SuspiciousActivity)
      resetThrottler();
      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      const stillLocked = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(stillLocked!.isLocked).toBe(true);
      expect(stillLocked!.lockReason).toBe(LockReason.SuspiciousActivity);
    });
  });

  // ──────────────────────────────────────────────────
  // Token reuse counter survives password reset
  // ──────────────────────────────────────────────────

  describe('token reuse counter reset on password reset unlock', () => {
    it('should reset the reuse counter so previous reuses do not carry over', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Accumulate reuse detections below threshold
      for (let i = 0; i < TOKEN_REUSE_MAX_COMPROMISED_FAMILIES - 1; i++) {
        await triggerTokenReuse(app, 'user@example.com', 'password123');
      }

      // Lock via password attempts
      await failPasswordAttempts(app, dataSource, 'user@example.com', PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD);

      // Unlock via password reset
      resetThrottler();
      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      // User is unlocked
      const unlockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(unlockedUser!.isLocked).toBe(false);

      // One more reuse should NOT lock — counter was reset, need full threshold again
      await triggerTokenReuse(app, 'user@example.com', 'N3wP@ssw0rd!');

      const stillUnlocked = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(stillUnlocked!.isLocked).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────
  // Password and MFA lock independence
  // ──────────────────────────────────────────────────

  describe('password and MFA lock independence', () => {
    it('should keep MFA counter independent from password counter reset', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const twoFactorAuth = await createTwoFactorAuth(dataSource, user, true);

      // Fail password below threshold, then succeed (resets password counter)
      for (let i = 0; i < PRIMARY_AUTH_MAX_ATTEMPTS - 1; i++) {
        resetThrottler();
        const sessionId = await createSession(app);
        await attemptPassword(app, sessionId, 'user@example.com', 'wrong');
      }

      resetThrottler();
      const session1 = await createSession(app);
      await attemptPassword(app, session1, 'user@example.com', 'password123');

      // Fail MFA to trigger MFA temporary lock
      for (let i = 0; i < MFA_AUTH_MAX_ATTEMPTS; i++) {
        await request(app.getHttpServer())
          .post(`${BASE}/mfa/totp/validate`)
          .set('X-Forwarded-For', `10.0.${i}.1`)
          .send({ sessionId: session1, code: '000000' })
          .expect(401);
      }

      // MFA is temporarily locked
      resetThrottler();
      await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId: session1, code: '000000' })
        .expect(429);

      // But password auth still works on a new session (counter was reset)
      resetThrottler();
      const session2 = await createSession(app);
      const res = await attemptPassword(app, session2, 'user@example.com', 'password123');
      expect(res.status).toBe(200);

      // MFA is still locked on the new session
      const code = speakeasy.totp({
        secret: twoFactorAuth.secret,
        encoding: 'base32'
      });

      const mfaRes = await request(app.getHttpServer())
        .post(`${BASE}/mfa/totp/validate`)
        .send({ sessionId: session2, code })
        .expect(429);

      expect(mfaRes.body.message).toBe('Too many attempts, try again later');
    });
  });

  // ──────────────────────────────────────────────────
  // Unlock via password reset
  // ──────────────────────────────────────────────────

  describe('unlock via password reset', () => {
    it('should unlock and allow sign-in after password reset (TOO_MANY_ATTEMPTS)', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Lock the account via failed attempts
      await failPasswordAttempts(app, dataSource, 'user@example.com', PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD);

      // Verify locked
      const lockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });
      expect(lockedUser!.isLocked).toBe(true);

      // Request forgot password
      resetThrottler();
      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      // Reset password
      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      // Verify unlocked
      const unlockedUser = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ email: 'user@example.com' });
      expect(unlockedUser!.isLocked).toBe(false);
      expect(unlockedUser!.lockedAt).toBeNull();
      expect(unlockedUser!.lockReason).toBeNull();

      // Sign in with new password
      resetThrottler();
      const sessionId = await createSession(app);
      const res = await attemptPassword(app, sessionId, 'user@example.com', 'N3wP@ssw0rd!');
      expect(res.status).toBe(200);
    });

    it('should NOT unlock via password reset when locked for SUSPICIOUS_ACTIVITY', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Lock for suspicious activity
      await dataSource.getRepository(UserEntity).update(user.id, {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: LockReason.SuspiciousActivity
      });

      // Request forgot password
      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      // Reset password succeeds
      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      // Still locked
      const stillLocked = await dataSource
        .getRepository(UserEntity)
        .findOneBy({ id: user.id });
      expect(stillLocked!.isLocked).toBe(true);
      expect(stillLocked!.lockReason).toBe(LockReason.SuspiciousActivity);

      // Sign in fails
      const sessionId = await createSession(app);
      const res = await attemptPassword(app, sessionId, 'user@example.com', 'N3wP@ssw0rd!');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should reset the attempt counter after unlock via password reset', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password123');

      // Lock via failed attempts
      await failPasswordAttempts(app, dataSource, 'user@example.com', PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD);

      // Forgot password + reset
      resetThrottler();
      await request(app.getHttpServer())
        .post('/api/v1/account/password/forgot')
        .send({ email: 'user@example.com' })
        .expect(202);

      const messages = await consumeEmailQueue();
      const token = messages[0].data.token as string;

      await request(app.getHttpServer())
        .post('/api/v1/account/password/reset')
        .send({ email: 'user@example.com', token, newPassword: 'N3wP@ssw0rd!' })
        .expect(200);

      // Should be able to fail again without immediate lock
      for (let i = 0; i < PRIMARY_AUTH_MAX_ATTEMPTS - 1; i++) {
        resetThrottler();
        const sessionId = await createSession(app);
        const res = await attemptPassword(app, sessionId, 'user@example.com', 'wrong');
        expect(res.status).toBe(401);
      }

      // Still not locked
      resetThrottler();
      const sessionId = await createSession(app);
      const res = await attemptPassword(app, sessionId, 'user@example.com', 'N3wP@ssw0rd!');
      expect(res.status).toBe(200);
    });
  });
});
