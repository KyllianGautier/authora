import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import Redis from 'ioredis';
import {
  AUTH_SESSION_KEY,
  AUTH_SESSION_USER_KEY
} from '../../config/redis-keys';
import { REDIS_CLIENT } from '../../config/redis.provider';
import { TENANT_CONFIG } from '../../config/tenant-config';
import type { AuthoraTenantConfig } from '../../config/tenant-config';
import { AuthSession, MfaPolicy } from '../../redis-model/auth-session.model';

export interface CreateAuthSessionOptions {
  tenantId: string;
  userId?: string;
  mode: 'first-party' | 'third-party';
  appId?: string;
  codeChallenge?: string;
  redirectUri?: string;
  primaryAuthVerified: boolean;
  rememberMe?: boolean;
  mfaPolicy: MfaPolicy;
  mfaSetup?: boolean;
  deviceTrusted?: boolean;
}

@Injectable()
export class AuthSessionRedisService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly _redis: Redis,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
  ) {}

  async create(options: CreateAuthSessionOptions): Promise<AuthSession> {
    const now = DateTime.utc();

    const session: AuthSession = {
      id: randomUUID(),
      tenantId: options.tenantId,
      userId: options.userId,
      mode: options.mode,
      appId: options.appId,
      codeChallenge: options.codeChallenge,
      redirectUri: options.redirectUri,
      primaryAuthVerified: options.primaryAuthVerified,
      rememberMe: options.rememberMe ?? false,
      mfaPolicy: options.mfaPolicy,
      mfaSetup: options.mfaSetup ?? false,
      mfaVerified: false,
      deviceTrusted: options.deviceTrusted ?? false,
      exchanged: false,
      createdAt: now.toISO(),
      expiresAt: now.plus({ seconds: this._tenantConfig.authSessionTtlSec }).toISO()
    };

    const key = AUTH_SESSION_KEY(session.id);

    await this._redis.set(key, JSON.stringify(session), 'EX', this._tenantConfig.authSessionTtlSec);

    if (session.userId !== undefined) {
      const userKey = AUTH_SESSION_USER_KEY(session.userId);
      await this._redis.set(userKey, session.id, 'EX', this._tenantConfig.authSessionTtlSec);
    }

    return session;
  }

  async findById(id: string): Promise<AuthSession | null> {
    const data = await this._redis.get(AUTH_SESSION_KEY(id));

    if (data === null) {
      return null;
    }

    return JSON.parse(data) as AuthSession;
  }

  async findActiveForUserId(userId: string): Promise<AuthSession | null> {
    const sessionId = await this._redis.get(AUTH_SESSION_USER_KEY(userId));

    if (sessionId === null) {
      return null;
    }

    return this.findById(sessionId);
  }

  async verify(session: AuthSession): Promise<void> {
    const exists = await this._redis.exists(AUTH_SESSION_KEY(session.id));

    if (!exists) {
      throw new InvalidAuthSessionException();
    }
  }

  async update(session: AuthSession): Promise<void> {
    const key = AUTH_SESSION_KEY(session.id);
    const ttl = await this._redis.ttl(key);

    if (ttl <= 0) {
      throw new InvalidAuthSessionException();
    }

    await this._redis.set(key, JSON.stringify(session), 'EX', ttl);
  }

  async delete(session: AuthSession): Promise<void> {
    await this._redis.del(AUTH_SESSION_KEY(session.id));

    if (session.userId !== undefined) {
      await this._redis.del(AUTH_SESSION_USER_KEY(session.userId));
    }
  }
}

export class InvalidAuthSessionException extends UnauthorizedException {
  constructor() {
    super('Invalid token');
  }
}
