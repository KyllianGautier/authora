import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import Redis from 'ioredis';
import {
  AUTH_SESSION_KEY,
  AUTH_SESSION_USER_KEY
} from '../../config/redis-keys';
import { REDIS_CLIENT } from '../../config/redis.provider';
import { AuthoraSetting } from '../../config/settings';
import { AuthSession, MfaPolicy } from '../../redis-model/auth-session.model';
import { SettingsService } from '../settings.service';
import { IntegrationMode } from '../../entity/tenant.entity';

@Injectable()
export class AuthSessionRedisService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly _redis: Redis,
    private readonly _settingsService: SettingsService
  ) {}

  async createFirstParty(tenantId: string, deviceFingerprint: string): Promise<AuthSession> {
    return this._persist({
      tenantId,
      mode: IntegrationMode.FirstParty,
      deviceFingerprint,
      primaryAuthVerified: false,
      rememberMe: false,
      mfaPolicy: MfaPolicy.Disabled,
      mfaSetup: false,
      mfaVerified: false,
      deviceTrusted: false,
      exchanged: false
    });
  }

  async createThirdParty(tenantId: string, redirectUri: string, codeChallenge: string): Promise<AuthSession> {
    return this._persist({
      tenantId,
      mode: IntegrationMode.ThirdParty,
      redirectUri,
      codeChallenge,
      primaryAuthVerified: false,
      rememberMe: false,
      mfaPolicy: MfaPolicy.Disabled,
      mfaSetup: false,
      mfaVerified: false,
      deviceTrusted: false,
      exchanged: false
    });
  }

  private async _persist(
    fields: Omit<AuthSession, 'id' | 'createdAt' | 'expiresAt'>
  ): Promise<AuthSession> {
    const authSessionTtlSec = await this._settingsService.get(AuthoraSetting.AuthSessionTtlSec);
    const now = DateTime.utc();

    const session: AuthSession = {
      id: randomUUID(),
      ...fields,
      createdAt: now.toISO(),
      expiresAt: now.plus({ seconds: authSessionTtlSec }).toISO()
    };

    const key = AUTH_SESSION_KEY(session.id);

    await this._redis.set(key, JSON.stringify(session), 'EX', authSessionTtlSec);

    if (session.userId !== undefined) {
      const userKey = AUTH_SESSION_USER_KEY(session.userId);
      await this._redis.set(userKey, session.id, 'EX', authSessionTtlSec);
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
