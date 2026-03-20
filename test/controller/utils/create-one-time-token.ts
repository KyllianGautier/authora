import { createHash } from 'crypto';
import Redis from 'ioredis';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { REDIS_CLIENT } from '../../../src/config/redis.provider';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';

export const FAKE_ONE_TIME_TOKEN = 'fake-one-time-token';

export async function createOneTimeToken(
  app: INestApplication<App>,
  userId: string,
  type: OneTimeTokenType,
  options?: { ttlSeconds?: number }
): Promise<void> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const tokenHash = createHash('sha256')
    .update(FAKE_ONE_TIME_TOKEN)
    .digest('hex');
  const ttl = options?.ttlSeconds ?? 3600;

  const key = 'ott:' + userId + ':' + type;

  await redis.set(key, tokenHash, 'EX', ttl);

  if (type === OneTimeTokenType.Exchange) {
    await redis.set('ott_exchange:' + tokenHash, userId, 'EX', ttl);
  }
}
