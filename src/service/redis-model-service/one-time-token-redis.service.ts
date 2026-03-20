import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.provider';
import { OneTimeTokenType } from '../../redis-model/one-time-token.model';

const OTT_PREFIX = 'ott:';
const OTT_EXCHANGE_PREFIX = 'ott_exchange:';

const TTL_SECONDS: Record<OneTimeTokenType, number> = {
  [OneTimeTokenType.AccountDeletion]: 3600,
  [OneTimeTokenType.TwoFactorAuthVerify]: 86400,
  [OneTimeTokenType.TwoFactorAuthValidate]: 86400,
  [OneTimeTokenType.TwoFactorAuthDisabling]: 86400,
  [OneTimeTokenType.ForgotPassword]: 3600,
  [OneTimeTokenType.MagicLink]: 300,
  [OneTimeTokenType.Exchange]: 300
};

@Injectable()
export class OneTimeTokenRedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly _redis: Redis) {}

  async create(userId: string, type: OneTimeTokenType): Promise<string> {
    const clearToken = randomBytes(32).toString('hex');
    const tokenHash = this._sha256(clearToken);
    const ttl = this._getTtlSeconds(type);

    const key = this._buildKey(userId, type);

    // If an existing token of the same type exists, clean up its exchange index
    if (type === OneTimeTokenType.Exchange) {
      const existingHash = await this._redis.get(key);

      if (existingHash !== null) {
        await this._redis.del(OTT_EXCHANGE_PREFIX + existingHash);
      }
    }

    // Store the token hash keyed by userId + type
    await this._redis.set(key, tokenHash, 'EX', ttl);

    // For exchange tokens, store a reverse index for lookup by token
    if (type === OneTimeTokenType.Exchange) {
      await this._redis.set(
        OTT_EXCHANGE_PREFIX + tokenHash,
        userId,
        'EX',
        ttl
      );
    }

    return clearToken;
  }

  async consume(
    userId: string,
    clearToken: string,
    type: OneTimeTokenType
  ): Promise<void> {
    const key = this._buildKey(userId, type);
    const storedHash = await this._redis.get(key);

    if (storedHash === null) {
      throw new InvalidTokenException();
    }

    const tokenHash = this._sha256(clearToken);

    if (storedHash !== tokenHash) {
      throw new InvalidTokenException();
    }

    // Consume the token (one-time use)
    await this._redis.del(key);
  }

  async consumeExchangeToken(clearToken: string): Promise<string> {
    const tokenHash = this._sha256(clearToken);
    const exchangeKey = OTT_EXCHANGE_PREFIX + tokenHash;

    const userId = await this._redis.get(exchangeKey);

    if (userId === null) {
      throw new InvalidTokenException();
    }

    // Consume both keys atomically
    const ottKey = this._buildKey(userId, OneTimeTokenType.Exchange);

    await this._redis.del(exchangeKey, ottKey);

    return userId;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const keys: string[] = [];

    for (const type of Object.values(OneTimeTokenType)) {
      const key = this._buildKey(userId, type);

      // For exchange tokens, also clean up the reverse index
      if (type === OneTimeTokenType.Exchange) {
        const existingHash = await this._redis.get(key);

        if (existingHash !== null) {
          keys.push(OTT_EXCHANGE_PREFIX + existingHash);
        }
      }

      keys.push(key);
    }

    if (keys.length > 0) {
      await this._redis.del(...keys);
    }
  }

  private _buildKey(userId: string, type: OneTimeTokenType): string {
    return OTT_PREFIX + userId + ':' + type;
  }

  private _sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private _getTtlSeconds(type: OneTimeTokenType): number {
    return TTL_SECONDS[type];
  }
}

export class InvalidTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid token');
  }
}
