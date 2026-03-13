import * as Joi from 'joi';
import { filePath } from './joi-file-path';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Database
  HOST: Joi.string().ip().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().default('authora_db'),

  // RabbitMQ
  RABBITMQ_URL: Joi.string().uri().required(),

  // Redis
  REDIS_URL: Joi.string().uri().required(),

  // Security
  HASH_SALT_ROUNDS: Joi.number().integer().min(1).default(10),
  EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(86400),
  ACCOUNT_DELETION_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(3600),
  TWO_FACTOR_AUTH_VERIFY_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(86400),
  TWO_FACTOR_AUTH_VALIDATE_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(86400),
  TWO_FACTOR_AUTH_DISABLING_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(86400),
  JWT_PRIVATE_KEY_PATH: filePath.required(),
  JWT_PUBLIC_KEY_PATH: filePath.required(),
  JWT_ACCESS_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(900),
  JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(86400),
  JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(2592000)
    .greater(Joi.ref('JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS')),
  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_ORIGIN_LIMIT: Joi.number().integer().min(1).default(30),
  THROTTLE_IDENTITY_LIMIT: Joi.number().integer().min(1).default(10),
  THROTTLE_COMBINED_LIMIT: Joi.number().integer().min(1).default(5),

  // Delay
  ENDPOINT_DELAY_MIN_MS: Joi.number().integer().min(0).default(200),
  ENDPOINT_DELAY_MAX_MS: Joi.number()
    .integer()
    .min(0)
    .default(400)
    .greater(Joi.ref('ENDPOINT_DELAY_MIN_MS'))
});
