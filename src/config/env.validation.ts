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

  // Multi-tenant
  ENABLE_MULTI_TENANT: Joi.boolean().default(false),

  // Authora-UI
  AUTHORA_UI_ENABLED: Joi.boolean().default(true),
  AUTHORA_UI_BASE_URL: Joi.string().uri().required(),

  // Admin
  AUTHORA_ADMIN_EMAIL: Joi.string().email().required(),
  AUTHORA_SUPER_ADMIN_USERNAME: Joi.string().required(),
  AUTHORA_SUPER_ADMIN_PASSWORD: Joi.string().required()
});
