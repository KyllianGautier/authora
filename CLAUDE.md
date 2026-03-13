# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Authora is an authentication microservice built with NestJS 11, TypeScript, PostgreSQL, RabbitMQ, and Redis. It handles user registration, sign-in with JWT, password management, two-factor authentication (TOTP), and rate limiting.

## Commands

- `npm run build` — Build the project
- `npm run start:dev` — Start dev server with watch mode (port 3000 by default, or `PORT` env var)
- `npm run lint` — Lint and auto-fix with ESLint (flat config) + Prettier
- `npm run format` — Format code with Prettier
- `npm test` — Run unit tests (Jest, files matching `*.spec.ts` in `src/`)
- `npm test -- --testPathPattern=<pattern>` — Run a single test file
- `npm run test:e2e` — Run e2e tests (files matching `*.e2e-spec.ts` in `test/`), requires Docker

## Code Style

- TypeScript with `nodenext` module resolution, target ES2023
- Prettier: single quotes, no trailing commas
- ESLint: `@typescript-eslint/no-explicit-any` is off; floating promises and unsafe arguments are warnings

## Architecture

### Module Structure

Single `AppModule` in `src/app.module.ts` — all controllers, services, and config are registered at the root level (no feature sub-modules).

### Two-Layer Service Pattern

- **Entity services** (`src/service/entity-service/`) — thin wrappers around TypeORM repositories for direct database access (UserEntityService, PasswordEntityService, RefreshTokenEntityService, RegistrationEntityService, OneTimeTokenEntityService, TwoFactorAuthEntityService)
- **Domain services** (`src/service/`) — business logic that composes entity services, HashService, EmailService, and ConfigService (SignUpService, SignInService, AuthService, TwoFactorAuthService)

### Authentication Flow

- JWT with RS256 (asymmetric keys loaded from filesystem paths)
- Access tokens returned in response body; refresh tokens set as httpOnly secure cookies (`sameSite: strict`)
- Refresh token rotation: old token revoked on each refresh
- Tokens stored hashed (Argon2id) in the database

### Key Custom Components

- **`@Delay()` decorator + DelayInterceptor** (`src/decorator/`, `src/interceptor/`) — adds random response delays to auth endpoints for timing attack mitigation
- **AuthThrottleGuard** (`src/config/auth-throttle.guard.ts`) — three-dimensional rate limiting (by IP, by email, by IP+email) using Redis-backed ThrottlerModule
- **`@IsDifferentFrom()` validator** (`src/dto/validator/`) — custom class-validator decorator for field inequality checks
- **JobService** (`src/service/job.service.ts`) — cron job that cleans up expired one-time tokens

### Entities (TypeORM / PostgreSQL)

- **UserEntity** → has many PasswordEntity, RefreshTokenEntity, OneTimeTokenEntity; has one TwoFactorAuthEntity
- **PasswordEntity** — password history for reuse prevention
- **RegistrationEntity** — pending sign-ups (deleted after email verification, not linked to User)
- **OneTimeTokenEntity** — typed tokens (enum: `TWO_FACTOR_AUTH_VERIFY`, `TWO_FACTOR_AUTH_VALIDATE`, `TWO_FACTOR_AUTH_DISABLING`, `ACCOUNT_DELETION`)

### External Services

- **RabbitMQ** — async email events published to `authora_email_queue` (patterns: `sign-up-verification`, `account-deletion-verification`)
- **Redis** — throttle state storage

### Configuration

Environment variables validated with Joi schema in `src/config/env.validation.ts`. Custom `filePath` Joi extension (`src/config/joi-file-path.ts`) validates JWT key paths exist and are readable. Copy `.env.example` to `.env` for local development.

## Testing

- **Unit tests** (`src/**/*.spec.ts`) — standard Jest mocks
- **E2E tests** (`test/**/*.e2e-spec.ts`) — use Testcontainers for PostgreSQL 17 and RabbitMQ 4 auto-provisioning
- **Test setup** (`test/setup.ts`) — generates temp RSA keys, configures minimal Argon2id params for speed, replaces Redis throttle storage with in-memory, provides `resetDatabase()` (TRUNCATE CASCADE) and `consumeEmailQueue()` helpers
- **Test utilities** in `test/utils/` — password hashing, cookie extraction, user creation helpers