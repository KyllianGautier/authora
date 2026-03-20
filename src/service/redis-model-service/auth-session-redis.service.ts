import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.provider';
import { AuthSession, MfaPolicy } from '../../redis-model/auth-session.model';

const SESSION_PREFIX = 'auth_session:';
const USER_SESSION_PREFIX = 'auth_session:user:';

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
  private readonly _ttlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly _redis: Redis,
    private readonly _configService: ConfigService
  ) {
    this._ttlSeconds = this._configService.getOrThrow<number>(
      'AUTH_SESSION_TTL_SEC'
    );
  }

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
      createdAt: now.toISO(),
      expiresAt: now.plus({ seconds: this._ttlSeconds }).toISO()
    };

    const key = SESSION_PREFIX + session.id;

    await this._redis.set(key, JSON.stringify(session), 'EX', this._ttlSeconds);

    if (session.userId !== undefined) {
      const userKey = USER_SESSION_PREFIX + session.userId;
      await this._redis.set(userKey, session.id, 'EX', this._ttlSeconds);
    }

    return session;
  }

  async findById(id: string): Promise<AuthSession | null> {
    const data = await this._redis.get(SESSION_PREFIX + id);

    if (data === null) {
      return null;
    }

    return JSON.parse(data) as AuthSession;
  }

  async findActiveForUserId(userId: string): Promise<AuthSession | null> {
    const sessionId = await this._redis.get(USER_SESSION_PREFIX + userId);

    if (sessionId === null) {
      return null;
    }

    return this.findById(sessionId);
  }

  async verify(session: AuthSession): Promise<void> {
    const exists = await this._redis.exists(SESSION_PREFIX + session.id);

    if (!exists) {
      throw new InvalidAuthSessionException();
    }
  }

  async update(session: AuthSession): Promise<void> {
    const key = SESSION_PREFIX + session.id;
    const ttl = await this._redis.ttl(key);

    if (ttl <= 0) {
      throw new InvalidAuthSessionException();
    }

    await this._redis.set(key, JSON.stringify(session), 'EX', ttl);
  }

  async delete(session: AuthSession): Promise<void> {
    await this._redis.del(SESSION_PREFIX + session.id);

    if (session.userId !== undefined) {
      await this._redis.del(USER_SESSION_PREFIX + session.userId);
    }
  }
}

export class InvalidAuthSessionException extends UnauthorizedException {
  constructor() {
    super('Invalid token');
  }
}
