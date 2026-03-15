# Security Audit — Authora

This document lists all security topics relevant to an authentication API, with their current status in Authora.

## TODO checklist

- [ ] [Session invalidation on password change](#session-invalidation-on-password-change)
- [ ] [Account lockout](#account-lockout)
- [ ] [Security headers (Helmet)](#security-headers-helmet)
- [ ] [CORS configuration](#cors-configuration)
- [ ] [Request payload size limiting](#request-payload-size-limiting)
- [ ] [Logging and monitoring](#logging-and-monitoring)
- [ ] [Dependency vulnerabilities](#dependency-vulnerabilities)
- [ ] [TOTP secret encryption at rest](#totp-secret-encryption-at-rest)
- [x] [Password hashing](#password-hashing)
- [x] [Password strength requirements](#password-strength-requirements)
- [x] [Password reuse prevention](#password-reuse-prevention)
- [x] [JWT configuration](#jwt-configuration)
- [x] [Access / refresh token separation](#access-token--refresh-token-separation)
- [x] [Refresh token hashing](#refresh-token-hashing)
- [x] [Refresh token rotation](#refresh-token-rotation)
- [x] [Generic error messages](#generic-error-messages)
- [x] [Timing attack mitigation](#timing-attack-mitigation)
- [x] [Two-factor authentication (2FA)](#two-factor-authentication-2fa)
- [x] [Rate limiting](#rate-limiting)
- [x] [Input validation](#input-validation)
- [x] [SQL injection protection](#sql-injection-protection)
- [x] [Cookie security (XSS / CSRF)](#cookie-security-xss--csrf)

---

## Password hashing

Passwords must never be stored in plain text. Use a robust hashing algorithm with automatic salting and a configurable cost factor.

**Recommended:** Argon2.

**Status: Implemented**

- Argon2id with configurable `HASH_MEMORY_COST`, `HASH_TIME_COST`, `HASH_PARALLELISM`
- Used for passwords, refresh tokens, one-time tokens, and recovery codes

---

## Password strength requirements

Reject weak passwords at the input validation level. Enforce minimum length and complexity (uppercase, lowercase, digits, special characters).

**Status: Implemented**

- Custom `@IsStrongPassword()` class-validator decorator with `ConfigService` integration
- 5 require rules: minimum length, digit, special character, lowercase, uppercase
- 5 forbid rules: sequential chars, repeated chars, keyboard sequences (QWERTY/AZERTY), user info (email parts), breached passwords (Have I Been Pwned API with k-anonymity)
- All rules configurable via environment variables (`PASSWORD_*`)
- `emailField` option to check password against user's email
- Breached password check uses fail-open strategy (skipped if API unreachable)

---

## Password reuse prevention

When a user changes their password, check that the new password has not been used before.

**Status: Implemented**

- `changePassword()` compares the new password against all previous hashed passwords
- Rejects the change if any match is found

---

## JWT configuration

Use asymmetric signing (RS256) with keys loaded from environment variables. Keep access tokens short-lived.

**Status: Implemented**

- RS256 with RSA key pair (`JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`)
- Access token: 15 minutes (configurable)
- Refresh token: 1 day or 30 days depending on `rememberMe`

---

## Access token / refresh token separation

Access tokens should be short-lived and returned in the response body. Refresh tokens should be long-lived and stored in a secure cookie.

**Status: Implemented**

- Access token returned in JSON response body
- Refresh token stored in `httpOnly`, `secure`, `sameSite: 'strict'` cookie

---

## Refresh token hashing

Refresh tokens must be hashed before storage, exactly like passwords. Only the client holds the clear value.

**Status: Implemented**

- Refresh tokens are Argon2id-hashed before being saved to the database
- Verification uses `argon2.verify()`

---

## Refresh token rotation

When a refresh token is used, invalidate it and issue a new one. This limits the window of exploitation if a token is stolen.

**Status: Implemented**

- `rotate()` marks the old token as `revoked: true` and creates a new one
- Previous tokens are also revoked when a new sign-in occurs (`create()`)

---

## Session invalidation on password change

When a user changes their password, all existing refresh tokens must be revoked to force re-authentication on every device.

**Status: Partial**

- `changePassword()` calls `revokeAllByUser()` after updating the password
- All active refresh tokens are marked as `revoked: true`
- E2E tests verify that refresh tokens are revoked and that token refresh fails after password change

**Additional considerations:**

- 2FA setup (`POST /api/v1/2fa/setup`) — enabling 2FA could warrant session invalidation to force re-authentication under the new security level
- 2FA disable — similarly, disabling 2FA lowers the security level; revoking sessions ensures re-authentication
- Account deletion (`POST /api/v1/auth/delete-account/verify`) — user is deleted entirely, tokens become orphaned (handled by cascading deletes)

---

## Generic error messages

Authentication endpoints must not reveal whether a user exists. Always return a generic message like "Invalid credentials".

**Status: Implemented**

- Sign-in, password change, and 2FA endpoints all return `"Invalid credentials"`
- No distinction between "user not found" and "wrong password"

---

## Timing attack mitigation

Even with generic error messages, response time differences can reveal whether a user exists or a password is correct. Add a random delay to sensitive endpoints.

**Status: Implemented**

- `@Delay()` decorator + `DelayInterceptor` with configurable `ENDPOINT_DELAY_MIN_MS` / `ENDPOINT_DELAY_MAX_MS`
- Applied to all enumeration-sensitive endpoints

---

## Two-factor authentication (2FA)

Offer TOTP-based 2FA with recovery codes as a fallback.

**Status: Implemented**

- TOTP setup with QR code and manual code
- Verification with 6-digit code
- 10 Argon2id-hashed recovery codes generated on activation
- Disable flow with one-time token verification

---

## Rate limiting

Limit the number of requests per IP/user to prevent brute force and credential stuffing attacks.

**Recommended:** `@nestjs/throttler` with a storage backend (e.g., Redis).

**Status: Implemented**

- `@nestjs/throttler` with Redis storage backend (`@nest-lab/throttler-storage-redis`)
- Custom `AuthThrottleGuard` with three-dimensional limiting: by IP (`origin`), by email (`identity`), and by IP+email (`combined`)
- Applied to sign-in and auth-sensitive endpoints via `@UseGuards(AuthThrottleGuard)`
- Configurable via `THROTTLE_TTL_SECONDS`, `THROTTLE_ORIGIN_LIMIT`, `THROTTLE_IDENTITY_LIMIT`, `THROTTLE_COMBINED_LIMIT`

---

## Account lockout

After N consecutive failed login attempts on a specific account, temporarily lock the account regardless of the source IP.

**Status: Missing**

- No failed attempt counter
- No lockout mechanism

---

## Input validation

Never trust client input. Validate and sanitize all incoming data at the DTO level.

**Status: Implemented**

- Global `ValidationPipe` with `whitelist: true`
- `class-validator` decorators on all input DTOs (`@IsEmail()`, `@IsString()`, `@IsNotEmpty()`, `@Length()`, etc.)

---

## SQL injection protection

Always use parameterized queries or a secure ORM. Never interpolate user input into raw SQL.

**Status: Implemented**

- TypeORM used exclusively with repository methods
- No raw SQL queries found

---

## Cookie security (XSS / CSRF)

Refresh token cookies must be configured to prevent client-side access and cross-site attacks.

**Status: Implemented**

- `httpOnly: true` — prevents JavaScript access
- `secure: true` — HTTPS only
- `sameSite: 'strict'` — blocks cross-site requests

---

## Security headers (Helmet)

HTTP security headers protect against clickjacking, MIME sniffing, and other browser-level attacks.

**Recommended:** Use the `helmet` middleware for `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, etc.

**Status: Missing**

- No `helmet` dependency
- No security headers configured in `main.ts`

---

## CORS configuration

Explicitly define which origins are allowed to call the API to prevent unauthorized cross-origin requests.

**Status: Missing**

- No `app.enableCors()` call
- No CORS middleware configured

---

## Request payload size limiting

Limit the size of incoming request bodies to prevent denial-of-service attacks with oversized payloads.

**Status: Missing**

- No body parser size limit configured in `main.ts`

---

## Logging and monitoring

Log authentication events (failed logins, password changes, token usage, suspicious IPs) for audit and incident response.

**Status: Missing**

- No auth event logging
- No audit trail

---

## Dependency vulnerabilities

Regularly audit dependencies for known CVEs. Integrate `npm audit` into CI/CD.

**Status: Missing**

- No `npm audit` script or security scanning tool configured

---

## TOTP secret encryption at rest

TOTP secrets are currently stored in plain text in the database. If the database is compromised, an attacker can generate valid TOTP codes for any user. Encrypt secrets at rest using a symmetric algorithm (e.g., AES-256-GCM) with a server-side key, and decrypt on read when verifying codes.

**Status: Missing**

- TOTP secrets stored as plain text in the `two_factor_auth` table
- No encryption key management in place
