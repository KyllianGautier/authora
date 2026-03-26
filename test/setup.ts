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
import { AuthoraConfigEntity } from '../src/entity/authora-config.entity';
import { TenantConfigEntity } from '../src/entity/tenant-config.entity';
import { testAuthoraConfig } from '../src/config/authora-config';
import type { AuthoraConfig } from '../src/config/authora-config';
import { testTenantConfig } from '../src/config/tenant-config';
import type { TenantConfig } from '../src/config/tenant-config';
import { AuthoraSetting, TenantSetting } from '../src/config/settings';
import { SETTINGS_AUTHORA_KEY, SETTINGS_TENANT_KEY } from '../src/config/redis-keys';
import { SettingsService } from '../src/service/settings.service';

let app: INestApplication<App>;
let initialized = false;

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

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule]
  })
    // Replace Redis-backed throttle storage with in-memory
    .overrideProvider(ThrottlerStorage)
    .useClass(ThrottlerStorageService)
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

  // Seed test configs into Redis via SettingsService
  await _seedTestSettings();

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
export async function setTenantConfig(
  overrides: Partial<TenantConfig>
): Promise<void> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const dataSource = app.get(DataSource);
  const tenant = await dataSource.getRepository(TenantEntity).findOneBy({ slug: 'default' });
  const tenantId = tenant?.id ?? '';
  const config = { ...testTenantConfig, ...overrides };

  const pipeline = redis.pipeline();

  for (const key of Object.values(TenantSetting)) {
    const value = (config as any)[key];
    const serialized = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    pipeline.set(SETTINGS_TENANT_KEY(tenantId, key), serialized);
    pipeline.set(SETTINGS_TENANT_KEY('', key), serialized);
  }

  await pipeline.exec();
}

// Override authora config for the current test. Resets automatically in resetTestState().
export async function setAuthoraConfig(
  overrides: Partial<AuthoraConfig>
): Promise<void> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const config = { ...testAuthoraConfig, ...overrides };

  const pipeline = redis.pipeline();

  for (const key of Object.values(AuthoraSetting)) {
    const value = (config as any)[key];
    pipeline.set(
      SETTINGS_AUTHORA_KEY(key),
      typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
    );
  }

  await pipeline.exec();
}

// Truncate all tables and reset throttler state between tests
export async function resetTestState(): Promise<void> {
  const dataSource = app.get(DataSource);
  const entities = dataSource.entityMetadatas;
  const tableNames = entities.map((e) => `"${e.schema}"."${e.tableName}"`).join(', ');
  await dataSource.query(`TRUNCATE TABLE ${tableNames} CASCADE`);

  // Recreate the default tenant after truncation
  const tenantRepository = dataSource.getRepository(TenantEntity);
  await tenantRepository.save(
    tenantRepository.create({ slug: 'default', name: 'Default' })
  );

  // Recreate the default configs after truncation
  const authoraConfigRepo = dataSource.getRepository(AuthoraConfigEntity);
  await authoraConfigRepo.save(
    authoraConfigRepo.create({ name: 'Default', isActive: true })
  );

  const tenant = await tenantRepository.findOneBy({ slug: 'default' });
  const tenantConfigRepo = dataSource.getRepository(TenantConfigEntity);
  await tenantConfigRepo.save(
    tenantConfigRepo.create({ name: 'Default', isActive: true, tenant: tenant! })
  );

  const storage = app.get(ThrottlerStorage);
  storage.onApplicationShutdown();
  storage.storage.clear();

  // Flush Redis and re-seed test settings
  const redis = app.get<Redis>(REDIS_CLIENT);
  const allKeys = await redis.keys('*');
  if (allKeys.length > 0) {
    await redis.del(...allKeys);
  }

  await _seedTestSettings();
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

// Seed the test settings into Redis
async function _seedTestSettings(): Promise<void> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const dataSource = app.get(DataSource);
  const tenant = await dataSource.getRepository(TenantEntity).findOneBy({ slug: 'default' });
  const tenantId = tenant?.id ?? '';

  const pipeline = redis.pipeline();

  for (const key of Object.values(AuthoraSetting)) {
    const value = (testAuthoraConfig as any)[key];
    pipeline.set(
      SETTINGS_AUTHORA_KEY(key),
      typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
    );
  }

  for (const key of Object.values(TenantSetting)) {
    const value = (testTenantConfig as any)[key];
    const serialized = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    pipeline.set(SETTINGS_TENANT_KEY(tenantId, key), serialized);
    // Also seed with empty tenantId for services that lack tenant context
    pipeline.set(SETTINGS_TENANT_KEY('', key), serialized);
  }

  await pipeline.exec();
}
