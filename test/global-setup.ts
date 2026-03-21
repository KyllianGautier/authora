import { generateKeyPairSync } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Generate RSA key pair for JWT signing if not already present on disk.
function ensureTestKeys() {
  const privatePath = process.env.JWT_PRIVATE_KEY_PATH!;
  const publicPath = process.env.JWT_PUBLIC_KEY_PATH!;

  if (existsSync(privatePath) && existsSync(publicPath)) return;

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2_048,
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

  // Start test containers and wait for healthchecks to pass
  execSync(
    'docker compose -f test/docker-compose.test.yml --env-file .env.test up -d --wait',
    { stdio: 'inherit' }
  );

  // Create the 'authora' schema (TypeORM synchronize only creates tables, not schemas)
  const pgClient = new Client({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT!),
    user: process.env.PG_USERNAME,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE
  });
  await pgClient.connect();
  await pgClient.query('CREATE SCHEMA IF NOT EXISTS authora');
  await pgClient.end();
}
