import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { readFileSync } from 'fs';

import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { useContainer } from 'class-validator';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/config/redis.provider';
import { TenantEntity } from '../src/entity/tenant.entity';
import { INFRA_CONFIG, testInfraConfig } from '../src/config/infra-config';
import type { AuthoraInfraConfig } from '../src/config/infra-config';
import { TENANT_CONFIG, defaultTenantConfig } from '../src/config/tenant-config';
import type { AuthoraTenantConfig } from '../src/config/tenant-config';

let app: INestApplication<App>;
let initialized = false;
let activeTenantConfig: AuthoraTenantConfig = { ...defaultTenantConfig };
let activeInfraConfig: AuthoraInfraConfig = { ...testInfraConfig };

export function getTestPublicKey(): string {
  return readFileSync(process.env.JWT_PUBLIC_KEY_PATH!, 'utf8');
}

export function getTestPrivateKey(): string {
  return readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, 'utf8');
}

// Bootstrap the NestJS app (singleton across test suites).
// Containers and schema are already set up by global-setup.ts.
// ConfigModule loads .env.test via envFilePath in AppModule.
export async function getTestApp(): Promise<INestApplication<App>> {
  if (initialized) return app;

  const tenantConfigProxy = new Proxy({} as AuthoraTenantConfig, {
    get: (_target, prop) => (activeTenantConfig as any)[prop]
  });

  const infraConfigProxy = new Proxy({} as AuthoraInfraConfig, {
    get: (_target, prop) => (activeInfraConfig as any)[prop]
  });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule]
  })
    // Replace Redis-backed throttle storage with in-memory
    .overrideProvider(ThrottlerStorage)
    .useClass(ThrottlerStorageService)
    // Use proxies so configs can be swapped per-test
    .overrideProvider(TENANT_CONFIG)
    .useValue(tenantConfigProxy)
    .overrideProvider(INFRA_CONFIG)
    .useValue(infraConfigProxy)
    .compile();

  app = moduleFixture.createNestApplication();

  // Enable DI resolution for custom class-validator validators (e.g. @IsStrongPassword)
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  app.setGlobalPrefix('api', { exclude: [] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  await app.init();

  initialized = true;
  return app;
}

// Reset only the throttler state (useful within tests that make many requests)
export function resetThrottler(): void {
  const storage = app.get(ThrottlerStorage);
  storage.onApplicationShutdown();
  storage.storage.clear();
}

// Override tenant config for the current test. Resets automatically in resetTestState().
export function setTenantConfig(
  overrides: Partial<AuthoraTenantConfig>
): void {
  activeTenantConfig = { ...defaultTenantConfig, ...overrides };
}

// Override infra config for the current test. Resets automatically in resetTestState().
export function setInfraConfig(
  overrides: Partial<AuthoraInfraConfig>
): void {
  activeInfraConfig = { ...testInfraConfig, ...overrides };
}

// Truncate all tables and reset throttler state between tests
export async function resetTestState(): Promise<void> {
  activeTenantConfig = { ...defaultTenantConfig };
  activeInfraConfig = { ...testInfraConfig };
  const dataSource = app.get(DataSource);
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(
      `TRUNCATE TABLE "${entity.schema}"."${entity.tableName}" CASCADE`
    );
  }

  // Recreate the default tenant after truncation
  const tenantRepository = dataSource.getRepository(TenantEntity);
  await tenantRepository.save(
    tenantRepository.create({ slug: 'default', name: 'Default' })
  );

  const storage = app.get(ThrottlerStorage);
  storage.onApplicationShutdown();
  storage.storage.clear();

  // Flush auth sessions, one-time tokens, and token reuse counters from Redis
  const redis = app.get<Redis>(REDIS_CLIENT);
  const keys = await redis.keys('auth_session:*');
  const ottKeys = await redis.keys('ott:*');
  const ottExchangeKeys = await redis.keys('ott_exchange:*');
  const tokenReuseKeys = await redis.keys('token_reuse:*');
  const allKeys = [
    ...keys,
    ...ottKeys,
    ...ottExchangeKeys,
    ...tokenReuseKeys
  ];
  if (allKeys.length > 0) {
    await redis.del(...allKeys);
  }
}

// Drain all messages from the RabbitMQ email queue and return their parsed payloads
export async function consumeEmailQueue(): Promise<
  { pattern: string; data: Record<string, unknown> }[]
> {
  const connection = await amqplib.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();
  await channel.assertQueue('authora_email_queue', { durable: true });

  const messages: { pattern: string; data: Record<string, unknown> }[] = [];

  let msg: amqplib.GetMessage | false;
  while ((msg = await channel.get('authora_email_queue', { noAck: true }))) {
    const content = JSON.parse(msg.content.toString());
    messages.push(content);
  }

  await channel.close();
  await connection.close();

  return messages;
}
