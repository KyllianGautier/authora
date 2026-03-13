import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { execSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

let postgresContainer: StartedTestContainer;
let rabbitmqContainer: StartedTestContainer;
let rabbitmqUrl: string;
let app: INestApplication<App>;
let initialized = false;
let testKeysDir: string;

export function getTestPublicKey(): string {
  return readFileSync(join(testKeysDir, 'public.pem'), 'utf8');
}

export function getTestPrivateKey(): string {
  return readFileSync(join(testKeysDir, 'private.pem'), 'utf8');
}

export async function getTestApp(): Promise<INestApplication<App>> {
  if (initialized) return app;

  // Start PostgreSQL and RabbitMQ containers
  postgresContainer = await new GenericContainer('postgres:17')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'authora_test'
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('ready to accept connections', 2))
    .start();

  rabbitmqContainer = await new GenericContainer('rabbitmq:4')
    .withExposedPorts(5672)
    .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
    .start();

  // Generate test RSA keys in a temp directory
  testKeysDir = mkdtempSync(join(tmpdir(), 'authora-test-keys-'));
  const privateKeyPath = join(testKeysDir, 'private.pem');
  const publicKeyPath = join(testKeysDir, 'public.pem');
  execSync(
    `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ${privateKeyPath} 2>/dev/null`
  );
  execSync(
    `openssl rsa -in ${privateKeyPath} -pubout -out ${publicKeyPath} 2>/dev/null`
  );

  // Set all environment variables BEFORE loading AppModule
  // so that ConfigModule.forRoot() picks up the dynamic container URLs
  process.env.PG_HOST = '127.0.0.1';
  process.env.PG_PORT = postgresContainer.getMappedPort(5432).toString();
  process.env.PG_USERNAME = 'test';
  process.env.PG_PASSWORD = 'test';
  process.env.PG_DATABASE = 'authora_test';
  rabbitmqUrl = `amqp://${rabbitmqContainer.getHost()}:${rabbitmqContainer.getMappedPort(5672)}`;
  process.env.RABBITMQ_URL = rabbitmqUrl;
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.NODE_ENV = 'test';
  process.env.HASH_MEMORY_COST = '1024';
  process.env.HASH_TIME_COST = '1';
  process.env.HASH_PARALLELISM = '1';
  process.env.EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS = '86400';
  process.env.ACCOUNT_DELETION_TOKEN_EXPIRATION_SECONDS = '3600';
  process.env.TWO_FACTOR_AUTH_VERIFY_TOKEN_EXPIRATION_SECONDS = '86400';
  process.env.TWO_FACTOR_AUTH_VALIDATE_TOKEN_EXPIRATION_SECONDS = '86400';
  process.env.TWO_FACTOR_AUTH_DISABLING_TOKEN_EXPIRATION_SECONDS = '86400';
  process.env.JWT_PRIVATE_KEY_PATH = privateKeyPath;
  process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;
  process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS = '900';
  process.env.JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS = '86400';
  process.env.JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS = '2592000';
  process.env.THROTTLE_TTL_SECONDS = '60';
  process.env.THROTTLE_ORIGIN_LIMIT = '30';
  process.env.THROTTLE_IDENTITY_LIMIT = '10';
  process.env.THROTTLE_COMBINED_LIMIT = '5';
  process.env.ENDPOINT_DELAY_MIN_MS = '1';
  process.env.ENDPOINT_DELAY_MAX_MS = '2';

  // Load AppModule AFTER env vars are set so ConfigModule.forRoot()
  // reads the correct dynamic container URLs instead of root .env values
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module');

  // Bootstrap the NestJS app (override Redis throttler storage with in-memory)
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(ThrottlerStorage)
    .useClass(ThrottlerStorageService)
    .compile();

  app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  initialized = true;
  return app;
}

// Reset all shared state between tests to ensure isolation
export async function resetTestState(): Promise<void> {
  // Truncate all database tables
  const dataSource = app.get(DataSource);
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
  }

  // Reset throttler in-memory storage
  const storage = app.get(ThrottlerStorage);
  // onApplicationShutdown clears all timeouts, then we can safely clear the map
  storage.onApplicationShutdown();
  storage.storage.clear();
}

// Consume all messages from the email queue and return their parsed payloads
export async function consumeEmailQueue(): Promise<
  { pattern: string; data: Record<string, unknown> }[]
> {
  const connection = await amqplib.connect(rabbitmqUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue('authora_email_queue', { durable: true });

  const messages: { pattern: string; data: Record<string, unknown> }[] = [];

  // Drain all available messages without waiting
  let msg: amqplib.GetMessage | false;
  while ((msg = await channel.get('authora_email_queue', { noAck: true }))) {
    const content = JSON.parse(msg.content.toString());
    messages.push(content);
  }

  await channel.close();
  await connection.close();

  return messages;
}
