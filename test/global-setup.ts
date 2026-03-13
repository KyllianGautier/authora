import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { GenericContainer, Wait } from 'testcontainers';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Generate RSA key pair for JWT signing if not already present on disk.
function ensureTestKeys() {
  const privatePath = process.env.JWT_PRIVATE_KEY_PATH!;
  const publicPath = process.env.JWT_PUBLIC_KEY_PATH!;

  if (existsSync(privatePath) && existsSync(publicPath)) return;

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  mkdirSync(dirname(privatePath), { recursive: true });
  writeFileSync(privatePath, privateKey);
  writeFileSync(publicPath, publicKey);
}

// Runs once before all test suites.
// Prepares the infrastructure: RSA keys, PostgreSQL, RabbitMQ, and DB schema.
// All config values (ports, credentials) come from .env.test.
export default async function globalSetup() {
  ensureTestKeys();

  const pgPort = parseInt(process.env.PG_PORT!);
  const rabbitmqUrl = new URL(process.env.RABBITMQ_URL!);
  const rabbitmqPort = parseInt(rabbitmqUrl.port);

  // Start containers on fixed ports matching .env.test
  const postgresContainer = await new GenericContainer('postgres:17')
    .withEnvironment({
      POSTGRES_USER: process.env.PG_USERNAME!,
      POSTGRES_PASSWORD: process.env.PG_PASSWORD!,
      POSTGRES_DB: process.env.PG_DATABASE!
    })
    .withExposedPorts({ container: 5432, host: pgPort })
    .withWaitStrategy(Wait.forLogMessage('ready to accept connections', 2))
    .start();

  const rabbitmqContainer = await new GenericContainer('rabbitmq:4')
    .withExposedPorts({ container: 5672, host: rabbitmqPort })
    .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
    .start();

  // Pass container references to global-teardown.ts via globalThis
  (globalThis as any).__POSTGRES_CONTAINER__ = postgresContainer;
  (globalThis as any).__RABBITMQ_CONTAINER__ = rabbitmqContainer;

  // Create the 'authora' schema (TypeORM synchronize only creates tables, not schemas)
  const pgClient = new Client({
    host: process.env.PG_HOST,
    port: pgPort,
    user: process.env.PG_USERNAME,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE
  });
  await pgClient.connect();
  await pgClient.query('CREATE SCHEMA IF NOT EXISTS authora');
  await pgClient.end();
}
