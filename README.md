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

The API is available at `http://localhost:3000`. Swagger documentation is served at `/api/v1/swagger`.

## Configuration

All variables with a default value are optional.

### Application

| Variable   | Description                            | Default       |
|------------|----------------------------------------|---------------|
| `NODE_ENV` | `development`, `production`, or `test` | `development` |
| `PORT`     | HTTP server port                       | `3000`        |

### External services

| Variable       | Description              | Default       |
|----------------|--------------------------|---------------|
| `PG_HOST`      | PostgreSQL host (IP)     | **required**  |
| `PG_PORT`      | PostgreSQL port          | `5432`        |
| `PG_USERNAME`  | PostgreSQL username      | **required**  |
| `PG_PASSWORD`  | PostgreSQL password      | **required**  |
| `PG_DATABASE`  | PostgreSQL database name | `authora_db`  |
| `RABBITMQ_URL` | RabbitMQ connection URL  | **required**  |
| `REDIS_URL`    | Redis connection URL     | **required**  |

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
| `JWT_PRIVATE_KEY_PATH`                                | Path to RS256 private key PEM file                                    | **required**        |
| `JWT_PUBLIC_KEY_PATH`                                 | Path to RS256 public key PEM file                                     | **required**        |
| `JWT_ACCESS_TOKEN_EXPIRATION_SECONDS`                 | Access token lifetime                                                 | `900` (15 min)      |
| `JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS`          | Refresh token lifetime (rememberMe: false)                            | `86400` (1 day)     |
| `JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS`           | Refresh token lifetime (rememberMe: true), must be greater than short | `2592000` (30 days) |
| `THROTTLE_TTL_SECONDS`                                | Rate limit window                                                     | `60` (1 min)        |
| `THROTTLE_ORIGIN_LIMIT`                               | Max requests per IP per window                                        | `30`                |
| `THROTTLE_IDENTITY_LIMIT`                             | Max requests per email per window                                     | `10`                |
| `THROTTLE_COMBINED_LIMIT`                             | Max requests per IP+email per window                                  | `5`                 |

### Password strength

| Variable                            | Description                                         | Default |
|-------------------------------------|-----------------------------------------------------|---------|
| `PASSWORD_MIN_LENGTH`               | Minimum password length (min 8)                     | `8`     |
| `PASSWORD_REQUIRE_DIGIT`            | Require at least one digit                          | `true`  |
| `PASSWORD_REQUIRE_SPECIAL_CHAR`     | Require at least one special character              | `true`  |
| `PASSWORD_REQUIRE_LOWERCASE`        | Require at least one lowercase letter               | `true`  |
| `PASSWORD_REQUIRE_UPPERCASE`        | Require at least one uppercase letter               | `true`  |
| `PASSWORD_FORBID_SEQUENTIAL_CHARS`  | Forbid sequential characters (e.g. `abcd`, `4321`)  | `false` |
| `PASSWORD_FORBID_REPEATED_CHARS`    | Forbid repeated characters (e.g. `aaa`, `111`)      | `false` |
| `PASSWORD_FORBID_KEYBOARD_SEQUENCE` | Forbid keyboard row sequences (e.g. `qwer`, `qsdf`) | `false` |
| `PASSWORD_FORBID_USER_INFO`         | Forbid parts of the user's email                    | `true`  |
| `PASSWORD_FORBID_COMMON_PASSWORD`   | Forbid breached passwords (Have I Been Pwned API)   | `false` |

Password strength rules are enforced on sign-up and password change. All can be toggled individually via environment variables.

**Require rules** check that the password meets minimum content requirements:

- **Minimum length** — the password must be at least `PASSWORD_MIN_LENGTH` characters long (minimum 8).
- **Digit** — requires at least one digit (`0-9`).
- **Special character** — requires at least one of the following characters:
  ```
  !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~
  ```
- **Lowercase letter** — requires at least one lowercase letter (`a-z`).
- **Uppercase letter** — requires at least one uppercase letter (`A-Z`).

**Forbid rules** reject passwords that contain unsafe patterns:

- **Sequential characters** — detects 4+ ascending or descending consecutive letters (`abcd`, `dcba`) or digits (`1234`, `9876`). Case-insensitive.
- **Repeated characters** — detects 3+ identical consecutive characters (`aaa`, `111`). Case-insensitive.
- **Keyboard sequences** — detects 4+ consecutive keys on QWERTY (EN/ES), AZERTY (FR), and QWERTZ (DE) keyboard rows (`qwer`, `asdf`, `azer`, `qsdf`, `ertz`, `yxcv`), including reversed sequences and the number row.
- **User info** — checks that the password does not contain parts of the user's email. The local part is split by `.`, `-`, `_`, `+` separators, and each domain label (excluding the TLD) is checked. Only parts of 3+ characters are matched. Case-insensitive.
- **Common passwords** — checks the password against the [Have I Been Pwned](https://haveibeenpwned.com/Passwords) API using k-anonymity (only the first 5 characters of the SHA-1 hash are sent). If the API is unreachable, the password is accepted (fail-open).

### Delay

| Variable                | Description                                                   | Default |
|-------------------------|---------------------------------------------------------------|---------|
| `ENDPOINT_DELAY_MIN_MS` | Minimum random response delay in ms                           | `200`   |
| `ENDPOINT_DELAY_MAX_MS` | Maximum random response delay in ms, must be greater than min | `400`   |

## API endpoints

| Method | Path                                         | Description                       |
|--------|----------------------------------------------|-----------------------------------|
| POST   | `/api/v1/sign-up`                            | Create a registration             |
| POST   | `/api/v1/sign-up/resend-verification-email`  | Resend email verification token   |
| POST   | `/api/v1/sign-up/check-email`                | Check if an email is available    |
| POST   | `/api/v1/sign-up/verify`                     | Verify email and create user      |
| POST   | `/api/v1/sign-in`                            | Sign in                           |
| POST   | `/api/v1/sign-in/refresh`                    | Refresh access token              |
| POST   | `/api/v1/auth/change-password`               | Change user password              |
| POST   | `/api/v1/auth/delete-account`                | Request account deletion          |
| POST   | `/api/v1/auth/delete-account/verify`         | Verify and delete account         |
| POST   | `/api/v1/2fa/setup`                          | Setup two-factor authentication   |
| POST   | `/api/v1/2fa/verify`                         | Enable two-factor authentication  |
| POST   | `/api/v1/2fa/disable`                        | Disable two-factor authentication |
| GET    | `/api/v1/password/rules`                     | Get password strength rules       |
| POST   | `/api/v1/password/check-strength`            | Check password strength           |

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
