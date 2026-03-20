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
  JWT_ISSUER: Joi.string().default('authora'),
  JWT_PRIVATE_KEY_PATH: filePath.required(),
  JWT_PUBLIC_KEY_PATH: filePath.required(),

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
  PASSWORD_FORBID_COMMON_PASSWORD: Joi.boolean().default(false)
});
