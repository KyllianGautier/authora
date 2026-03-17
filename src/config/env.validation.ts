import * as Joi from 'joi';
import { filePath } from './joi-file-path';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  AUTHORA_BASE_URL: Joi.string().uri().required(),

  // PostgreSQL
  PG_HOST: Joi.string().ip().required(),
  PG_PORT: Joi.number().port().default(5432),
  PG_USERNAME: Joi.string().required(),
  PG_PASSWORD: Joi.string().required(),
  PG_DATABASE: Joi.string().default('authora_db'),

  // RabbitMQ
  RABBITMQ_URL: Joi.string().uri().required(),

  // Redis
  REDIS_URL: Joi.string().uri().required(),

  // Security
  HASH_MEMORY_COST: Joi.number().integer().min(1).default(65536),
  HASH_TIME_COST: Joi.number().integer().min(1).default(3),
  HASH_PARALLELISM: Joi.number().integer().min(1).default(4),
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
  MAGIC_LINK_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(300),
  MAGIC_LINK_REFRESH_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(86400),
  FORGOT_PASSWORD_TOKEN_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(3600),
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

  // Password strength
  PASSWORD_MIN_LENGTH: Joi.number().integer().min(8).default(8),
  PASSWORD_REQUIRE_DIGIT: Joi.boolean().default(true),
  PASSWORD_REQUIRE_SPECIAL_CHAR: Joi.boolean().default(true),
  PASSWORD_REQUIRE_LOWERCASE: Joi.boolean().default(true),
  PASSWORD_REQUIRE_UPPERCASE: Joi.boolean().default(true),
  PASSWORD_FORBID_SEQUENTIAL_CHARS: Joi.boolean().default(false),
  PASSWORD_FORBID_REPEATED_CHARS: Joi.boolean().default(false),
  PASSWORD_FORBID_KEYBOARD_SEQUENCE: Joi.boolean().default(false),
  PASSWORD_FORBID_USER_INFO: Joi.boolean().default(true),
  PASSWORD_FORBID_COMMON_PASSWORD: Joi.boolean().default(false),

  // Delay
  ENDPOINT_DELAY_MIN_MS: Joi.number().integer().min(0).default(200),
  ENDPOINT_DELAY_MAX_MS: Joi.number()
    .integer()
    .min(0)
    .default(400)
    .greater(Joi.ref('ENDPOINT_DELAY_MIN_MS'))
});
