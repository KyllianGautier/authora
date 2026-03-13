# Authora

Authentication microservice built with NestJS 11, TypeScript, PostgreSQL, RabbitMQ, and Redis.

## Features

- User registration with email verification
- Password management with history-based reuse prevention
- Account deletion with email verification
- Two-factor authentication (TOTP) with recovery codes
- JWT-based sign-in with refresh tokens (httpOnly cookie)
- Asynchronous email notifications via RabbitMQ
- Automatic revocation of expired one-time tokens (cron job)
- Rate limiting with three dimensions (IP, email, IP+email) backed by Redis

## Prerequisites

- Node.js
- Docker & Docker Compose

## Getting started

1. Start the infrastructure services:

```bash
docker compose up -d
```

2. Install dependencies:

```bash
npm install
```

3. Generate an RSA key pair for JWT signing:

```bash
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/private.pem
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

The `keys/` directory is gitignored. Each environment should have its own key pair.

4. Copy `.env.example` to `.env` and fill in the values.

5. Start the application:

```bash
npm run start:dev
```

The API is available at `http://localhost:3000`. Swagger documentation is served at `/api`.

## Configuration

All variables with a default value are optional.

### Application

| Variable   | Description                            | Default       |
|------------|----------------------------------------|---------------|
| `NODE_ENV` | `development`, `production`, or `test` | `development` |
| `PORT`     | HTTP server port                       | `3000`        |

### Database, messaging & Redis

| Variable       | Description             | Default      |
|----------------|-------------------------|--------------|
| `HOST`         | Database host (IP)      | *required*   |
| `DB_PORT`      | Database port           | `5432`       |
| `DB_USERNAME`  | Database username       | *required*   |
| `DB_PASSWORD`  | Database password       | *required*   |
| `DB_NAME`      | Database name           | `authora_db` |
| `RABBITMQ_URL` | RabbitMQ connection URL | *required*   |
| `REDIS_URL`    | Redis connection URL    | *required*   |

### Security

| Variable                                              | Description                                                           | Default             |
|-------------------------------------------------------|-----------------------------------------------------------------------|---------------------|
| `HASH_MEMORY_COST`                                    | Password hashing memory cost in KiB                                   | `65536` (64 MB)     |
| `HASH_TIME_COST`                                      | Password hashing time cost (iterations)                               | `3`                 |
| `HASH_PARALLELISM`                                    | Password hashing parallelism (threads)                                | `4`                 |
| `EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS`         | Sign-up token lifetime                                                | `86400` (1 day)     |
| `ACCOUNT_DELETION_TOKEN_EXPIRATION_SECONDS`           | Account deletion token TTL                                            | `3600` (1 hour)     |
| `TWO_FACTOR_AUTH_VERIFY_TOKEN_EXPIRATION_SECONDS`     | 2FA verify token lifetime                                             | `86400` (1 day)     |
| `TWO_FACTOR_AUTH_VALIDATE_TOKEN_EXPIRATION_SECONDS`   | 2FA validate token lifetime                                           | `86400` (1 day)     |
| `TWO_FACTOR_AUTH_DISABLING_TOKEN_EXPIRATION_SECONDS`  | 2FA disabling token TTL                                               | `86400` (1 day)     |
| `JWT_PRIVATE_KEY_PATH`                                | Path to RS256 private key PEM file                                    | *required*          |
| `JWT_PUBLIC_KEY_PATH`                                 | Path to RS256 public key PEM file                                     | *required*          |
| `JWT_ACCESS_TOKEN_EXPIRATION_SECONDS`                 | Access token lifetime                                                 | `900` (15 min)      |
| `JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS`          | Refresh token lifetime (rememberMe: false)                            | `86400` (1 day)     |
| `JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS`           | Refresh token lifetime (rememberMe: true), must be greater than short | `2592000` (30 days) |
| `THROTTLE_TTL_SECONDS`                                | Rate limit window                                                     | `60` (1 min)        |
| `THROTTLE_ORIGIN_LIMIT`                               | Max requests per IP per window                                        | `30`                |
| `THROTTLE_IDENTITY_LIMIT`                             | Max requests per email per window                                     | `10`                |
| `THROTTLE_COMBINED_LIMIT`                             | Max requests per IP+email per window                                  | `5`                 |

### Delay

| Variable       | Description                                          | Default |
|----------------|------------------------------------------------------|---------|
| `ENDPOINT_DELAY_MIN_MS` | Minimum random response delay in ms  | `200`   |
| `ENDPOINT_DELAY_MAX_MS` | Maximum random response delay in ms, must be greater than min  | `400`   |

## API endpoints

| Method | Path                                 | Description                      |
|--------|--------------------------------------|----------------------------------|
| POST   | `/sign-up`                           | Create a registration            |
| POST   | `/sign-up/resend-verification-email` | Resend email verification token  |
| POST   | `/sign-up/check-email`               | Check if an email is available   |
| POST   | `/sign-up/verify`                    | Verify email and create user     |
| POST   | `/sign-in`                           | Sign in                          |
| POST   | `/sign-in/refresh`                   | Refresh access token             |
| POST   | `/auth/change-password`              | Change user password             |
| POST   | `/auth/delete-account`               | Request account deletion         |
| POST   | `/auth/delete-account/verify`        | Verify and delete account        |
| POST   | `/2fa/setup`                         | Setup two-factor authentication  |
| POST   | `/2fa/verify`                        | Enable two-factor authentication |

## RabbitMQ messages

Authora publishes email notification events to the `authora_email_queue` durable queue. A separate consumer service is expected to process these messages and send the actual emails.

Each message is a JSON object with the following structure:

```json
{
  "pattern": "<event-type>",
  "data": { ... }
}
```

### Event types

#### `sign-up-verification`

Published when a user signs up or requests a new verification email.

```json
{
  "pattern": "sign-up-verification",
  "data": {
    "email": "user@example.com",
    "token": "a]4f2b..."
  }
}
```

#### `account-deletion-verification`

Published when a user requests account deletion.

```json
{
  "pattern": "account-deletion-verification",
  "data": {
    "email": "user@example.com",
    "token": "b7e9c1..."
  }
}
```

## Scripts

```bash
npm run build          # Build the project
npm run start:dev      # Start in watch mode
npm run lint           # Lint and auto-fix
npm run format         # Format with Prettier
npm test               # Run unit tests
npm run test:e2e       # Run e2e tests (requires Docker)
```

## Testing

End-to-end tests use [Testcontainers](https://testcontainers.com/) to spin up PostgreSQL and RabbitMQ containers automatically. No manual setup is needed beyond having Docker running.

```bash
npm run test:e2e
```
