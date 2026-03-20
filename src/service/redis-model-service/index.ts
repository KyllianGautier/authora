import { AuthSessionRedisService } from './auth-session-redis.service';
import { OneTimeTokenRedisService } from './one-time-token-redis.service';

export const REDIS_MODEL_SERVICES = [
  AuthSessionRedisService,
  OneTimeTokenRedisService
];
