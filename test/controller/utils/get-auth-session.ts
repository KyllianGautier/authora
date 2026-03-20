import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { App } from 'supertest/types';
import { AuthSession } from '../../../src/redis-model/auth-session.model';
import { REDIS_CLIENT } from '../../../src/config/redis.provider';

const SESSION_PREFIX = 'auth_session:';

export async function getAuthSession(
  app: INestApplication<App>,
  sessionId: string
): Promise<AuthSession | null> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const data = await redis.get(SESSION_PREFIX + sessionId);

  if (data === null) {
    return null;
  }

  return JSON.parse(data) as AuthSession;
}
