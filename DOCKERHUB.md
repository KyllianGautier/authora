# Authora

Authentication microservice built with NestJS 11, TypeScript, PostgreSQL, RabbitMQ, and Redis.

## Features

- User registration with email verification
- Password management with history-based reuse prevention
- Account deletion with email verification
- Two-factor authentication (TOTP) with recovery codes
- JWT-based sign-in (RS256) with refresh tokens (httpOnly cookie)
- Asynchronous email notifications via RabbitMQ
- Automatic revocation of expired one-time tokens (cron job)

## Quick start

```yaml
services:
  authora:
    image: authora:latest
    ports:
      - '3000:3000'
    environment:
      PG_HOST: ${PG_HOST}
      PG_USERNAME: ${PG_USERNAME}
      PG_PASSWORD: ${PG_PASSWORD}
      RABBITMQ_URL: ${RABBITMQ_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_PRIVATE_KEY_PATH: ${JWT_PRIVATE_KEY_PATH}
      JWT_PUBLIC_KEY_PATH: ${JWT_PUBLIC_KEY_PATH}
    volumes:
      - ./keys:/keys:ro
    depends_on:
      - postgres
      - rabbitmq
      - redis

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${PG_USERNAME}
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: ${PG_DATABASE}
    volumes:
      - pgdata:/var/lib/postgresql/data

  rabbitmq:
    image: rabbitmq:4-management-alpine

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

### RSA key pair

Authora uses RS256 for JWT signing. Generate a key pair and mount it into the container:

```bash
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/private.pem
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

Then start the stack:

```bash
docker compose up -d
```

The API is available at `http://localhost:3000`. Swagger documentation is served at `/api`.

## Environment variables

All variables with a default value are optional.

### Application

| Variable   | Description                            | Default       |
|------------|----------------------------------------|---------------|
| `NODE_ENV` | `development`, `production`, or `test` | `development` |
| `PORT`     | HTTP server port                       | `3000`        |

### External services

| Variable       | Description              | Default      |
|----------------|--------------------------|--------------|
| `PG_HOST`      | PostgreSQL host (IP)     | **required** |
| `PG_PORT`      | PostgreSQL port          | `5432`       |
| `PG_USERNAME`  | PostgreSQL username      | **required** |
| `PG_PASSWORD`  | PostgreSQL password      | **required** |
| `PG_DATABASE`  | PostgreSQL database name | `authora_db` |
| `RABBITMQ_URL` | RabbitMQ connection URL  | **required** |
| `REDIS_URL`    | Redis connection URL     | **required** |

### Security

| Variable                                             | Description                                                           | Default             |
|------------------------------------------------------|-----------------------------------------------------------------------|---------------------|
| `HASH_MEMORY_COST`                                   | Password hashing memory cost in KiB                                   | `65536` (64 MB)     |
| `HASH_TIME_COST`                                     | Password hashing time cost (iterations)                               | `3`                 |
| `HASH_PARALLELISM`                                   | Password hashing parallelism (threads)                                | `4`                 |
| `EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS`        | Sign-up token lifetime                                                | `86400` (1 day)     |
| `ACCOUNT_DELETION_TOKEN_EXPIRATION_SECONDS`          | Account deletion token TTL                                            | `3600` (1 hour)     |
| `TWO_FACTOR_AUTH_VERIFY_TOKEN_EXPIRATION_SECONDS`    | 2FA verify token lifetime                                             | `86400` (1 day)     |
| `TWO_FACTOR_AUTH_VALIDATE_TOKEN_EXPIRATION_SECONDS`  | 2FA validate token lifetime                                           | `86400` (1 day)     |
| `TWO_FACTOR_AUTH_DISABLING_TOKEN_EXPIRATION_SECONDS` | 2FA disabling token TTL                                               | `86400` (1 day)     |
| `JWT_PRIVATE_KEY_PATH`                               | Path to RS256 private key PEM file                                    | **required**        |
| `JWT_PUBLIC_KEY_PATH`                                | Path to RS256 public key PEM file                                     | **required**        |
| `JWT_ACCESS_TOKEN_EXPIRATION_SECONDS`                | Access token lifetime                                                 | `900` (15 min)      |
| `JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS`         | Refresh token lifetime (rememberMe: false)                            | `86400` (1 day)     |
| `JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS`          | Refresh token lifetime (rememberMe: true), must be greater than short | `2592000` (30 days) |
| `THROTTLE_TTL_SECONDS`                               | Rate limit window                                                     | `60` (1 min)        |
| `THROTTLE_ORIGIN_LIMIT`                              | Max requests per IP per window                                        | `30`                |
| `THROTTLE_IDENTITY_LIMIT`                            | Max requests per email per window                                     | `10`                |
| `THROTTLE_COMBINED_LIMIT`                            | Max requests per IP+email per window                                  | `5`                 |

### Password strength

| Variable                             | Description                                          | Default |
|--------------------------------------|------------------------------------------------------|---------|
| `PASSWORD_MIN_LENGTH`                | Minimum password length (min 8)                      | `8`     |
| `PASSWORD_REQUIRE_DIGIT`             | Require at least one digit                           | `true`  |
| `PASSWORD_REQUIRE_SPECIAL_CHAR`      | Require at least one special character               | `true`  |
| `PASSWORD_REQUIRE_LOWERCASE`         | Require at least one lowercase letter                | `true`  |
| `PASSWORD_REQUIRE_UPPERCASE`         | Require at least one uppercase letter                | `true`  |
| `PASSWORD_FORBID_SEQUENTIAL_CHARS`   | Forbid sequential characters (e.g. `abcd`, `4321`)   | `false` |
| `PASSWORD_FORBID_REPEATED_CHARS`     | Forbid repeated characters (e.g. `aaa`, `111`)       | `false` |
| `PASSWORD_FORBID_KEYBOARD_SEQUENCE`  | Forbid keyboard row sequences (e.g. `qwer`, `qsdf`)  | `false` |
| `PASSWORD_FORBID_USER_INFO`          | Forbid parts of the user's email                     | `true`  |
| `PASSWORD_FORBID_COMMON_PASSWORD`    | Forbid breached passwords (Have I Been Pwned API)    | `false` |

### Delay

| Variable                | Description                                                   | Default |
|-------------------------|---------------------------------------------------------------|---------|
| `ENDPOINT_DELAY_MIN_MS` | Minimum random response delay in ms                           | `200`   |
| `ENDPOINT_DELAY_MAX_MS` | Maximum random response delay in ms, must be greater than min | `400`   |

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

**`sign-up-verification`** — Published when a user signs up or requests a new verification email.

```json
{
  "pattern": "sign-up-verification",
  "data": {
    "email": "user@example.com",
    "token": "a4f2b..."
  }
}
```

**`account-deletion-verification`** — Published when a user requests account deletion.

```json
{
  "pattern": "account-deletion-verification",
  "data": {
    "email": "user@example.com",
    "token": "b7e9c1..."
  }
}
```

## Source

[GitHub](https://github.com/authora/authora)
