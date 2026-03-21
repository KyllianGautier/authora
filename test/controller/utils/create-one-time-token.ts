import { createHash } from 'crypto';
import Redis from 'ioredis';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { REDIS_CLIENT } from '../../../src/config/redis.provider';
import { AuthSession } from '../../../src/redis-model/auth-session.model';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';
import { createAuthSession } from './create-auth-session';

export const FAKE_ONE_TIME_TOKEN = 'fake-one-time-token';

export interface CreateOneTimeTokenResult {
  session?: AuthSession;
}

export async function createOneTimeToken(
  app: INestApplication<App>,
  userId: string,
  type: OneTimeTokenType,
  options?: { ttlSeconds?: number }
): Promise<CreateOneTimeTokenResult> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const tokenHash = createHash('sha256')
    .update(FAKE_ONE_TIME_TOKEN)
    .digest('hex');
  const ttl = options?.ttlSeconds ?? 3600;

  const key = 'ott:' + userId + ':' + type;

  await redis.set(key, tokenHash, 'EX', ttl);

  if (type === OneTimeTokenType.Exchange) {
    // Create an auth session and store its id in the reverse index
    const session = await createAuthSession(app, {
      userId,
      primaryAuthVerified: true,
      exchanged: true
    });
    await redis.set('ott_exchange:' + tokenHash, session.id, 'EX', ttl);
    return { session };
  }

  return {};
}
