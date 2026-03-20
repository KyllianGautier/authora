import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { App } from 'supertest/types';
import { REDIS_CLIENT } from '../../../src/config/redis.provider';
import { OneTimeTokenType } from '../../../src/redis-model/one-time-token.model';

export async function getOneTimeToken(
  app: INestApplication<App>,
  userId: string,
  type: OneTimeTokenType
): Promise<string | null> {
  const redis = app.get<Redis>(REDIS_CLIENT);

  return redis.get('ott:' + userId + ':' + type);
}
