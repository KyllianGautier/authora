import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import Redis from 'ioredis';
import { App } from 'supertest/types';
import { AUTH_SESSION_TTL_SEC } from '../../../src/config/constants';
import { REDIS_CLIENT } from '../../../src/config/redis.provider';
import { AuthSession, MfaPolicy } from '../../../src/redis-model/auth-session.model';

const SESSION_PREFIX = 'auth_session:';
const USER_SESSION_PREFIX = 'auth_session:user:';

export interface CreateAuthSessionOptions {
  userId?: string;
  tenantId?: string;
  primaryAuthVerified?: boolean;
  rememberMe?: boolean;
  mfaPolicy?: MfaPolicy;
  mfaSetup?: boolean;
  mfaVerified?: boolean;
  deviceTrusted?: boolean;
  deviceFingerprint?: string;
  exchanged?: boolean;
}

export async function createAuthSession(
  app: INestApplication<App>,
  options?: CreateAuthSessionOptions
): Promise<AuthSession> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const now = DateTime.utc();

  const session: AuthSession = {
    id: randomUUID(),
    tenantId: options?.tenantId ?? 'default',
    userId: options?.userId,
    mode: 'first-party',
    primaryAuthVerified: options?.primaryAuthVerified ?? false,
    rememberMe: options?.rememberMe ?? false,
    mfaPolicy: options?.mfaPolicy ?? 'DISABLED',
    mfaSetup: options?.mfaSetup ?? false,
    mfaVerified: options?.mfaVerified ?? false,
    deviceTrusted: options?.deviceTrusted ?? false,
    deviceFingerprint: options?.deviceFingerprint,
    exchanged: options?.exchanged ?? false,
    createdAt: now.toISO(),
    expiresAt: now.plus({ seconds: AUTH_SESSION_TTL_SEC }).toISO()
  };

  await redis.set(
    SESSION_PREFIX + session.id,
    JSON.stringify(session),
    'EX',
    AUTH_SESSION_TTL_SEC
  );

  if (session.userId !== undefined) {
    await redis.set(
      USER_SESSION_PREFIX + session.userId,
      session.id,
      'EX',
      AUTH_SESSION_TTL_SEC
    );
  }

  return session;
}
