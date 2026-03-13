# Security Audit — Authora

This document lists all security topics relevant to an authentication API, with their current status in Authora.

## Missing

| #  | Topic                                                                                 |
|----|---------------------------------------------------------------------------------------|
| 2  | [Password strength requirements](#2-password-strength-requirements)                   |
| 8  | [Session invalidation on password change](#8-session-invalidation-on-password-change) |
| 13 | [Account lockout](#13-account-lockout)                                                |
| 17 | [Security headers (Helmet)](#17-security-headers-helmet)                              |
| 18 | [CORS configuration](#18-cors-configuration)                                          |
| 19 | [Request payload size limiting](#19-request-payload-size-limiting)                    |
| 20 | [Logging and monitoring](#20-logging-and-monitoring)                                  |
| 21 | [Dependency vulnerabilities](#21-dependency-vulnerabilities)                          |

## Implemented

| #  | Topic                                                                          |
|----|--------------------------------------------------------------------------------|
| 1  | [Password hashing](#1-password-hashing)                                        |
| 3  | [Password reuse prevention](#3-password-reuse-prevention)                      |
| 4  | [JWT configuration](#4-jwt-configuration)                                      |
| 5  | [Access / refresh token separation](#5-access-token--refresh-token-separation) |
| 6  | [Refresh token hashing](#6-refresh-token-hashing)                              |
| 7  | [Refresh token rotation](#7-refresh-token-rotation)                            |
| 9  | [Generic error messages](#9-generic-error-messages)                            |
| 10 | [Timing attack mitigation](#10-timing-attack-mitigation)                       |
| 11 | [Two-factor authentication](#11-two-factor-authentication-2fa)                 |
| 12 | [Rate limiting](#12-rate-limiting)                                             |
| 14 | [Input validation](#14-input-validation)                                       |
| 15 | [SQL injection protection](#15-sql-injection-protection)                       |
| 16 | [Cookie security](#16-cookie-security-xss--csrf)                               |

---

## 1. Password hashing

Passwords must never be stored in plain text. Use a robust hashing algorithm with automatic salting and a configurable cost factor.

**Recommended:** Argon2.

**Status: Implemented**

- Argon2id with configurable `HASH_MEMORY_COST`, `HASH_TIME_COST`, `HASH_PARALLELISM`
- Used for passwords, refresh tokens, one-time tokens, and recovery codes

---

## 2. Password strength requirements

Reject weak passwords at the input validation level. Enforce minimum length and complexity (uppercase, lowercase, digits, special characters).

**Status: Missing**

- Password fields only have `@IsString()` and `@IsNotEmpty()` validators
- No minimum length, no complexity rules
- Users can register with passwords like `"a"`

---

## 3. Password reuse prevention

When a user changes their password, check that the new password has not been used before.

**Status: Implemented**

- `changePassword()` compares the new password against all previous hashed passwords
- Rejects the change if any match is found

---

## 4. JWT configuration

Use asymmetric signing (RS256) with keys loaded from environment variables. Keep access tokens short-lived.

**Status: Implemented**

- RS256 with RSA key pair (`JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`)
- Access token: 15 minutes (configurable)
- Refresh token: 1 day or 30 days depending on `rememberMe`

---

## 5. Access token / refresh token separation

Access tokens should be short-lived and returned in the response body. Refresh tokens should be long-lived and stored in a secure cookie.

**Status: Implemented**

- Access token returned in JSON response body
- Refresh token stored in `httpOnly`, `secure`, `sameSite: 'strict'` cookie

---

## 6. Refresh token hashing

Refresh tokens must be hashed before storage, exactly like passwords. Only the client holds the clear value.

**Status: Implemented**

- Refresh tokens are Argon2id-hashed before being saved to the database
- Verification uses `argon2.verify()`

---

## 7. Refresh token rotation

When a refresh token is used, invalidate it and issue a new one. This limits the window of exploitation if a token is stolen.

**Status: Implemented**

- `rotate()` marks the old token as `revoked: true` and creates a new one
- Previous tokens are also revoked when a new sign-in occurs (`create()`)

---

## 8. Session invalidation on password change

When a user changes their password, all existing refresh tokens must be revoked to force re-authentication on every device.

**Status: Missing**

- `changePassword()` revokes the old password but does not revoke refresh tokens
- An attacker with a stolen refresh token would retain access after the password is changed

---

## 9. Generic error messages

Authentication endpoints must not reveal whether a user exists. Always return a generic message like "Invalid credentials".

**Status: Implemented**

- Sign-in, password change, and 2FA endpoints all return `"Invalid credentials"`
- No distinction between "user not found" and "wrong password"

---

## 10. Timing attack mitigation

Even with generic error messages, response time differences can reveal whether a user exists or a password is correct. Add a random delay to sensitive endpoints.

**Status: Implemented**

- `@Delay()` decorator + `DelayInterceptor` with configurable `ENDPOINT_DELAY_MIN_MS` / `ENDPOINT_DELAY_MAX_MS`
- Applied to all enumeration-sensitive endpoints

---

## 11. Two-factor authentication (2FA)

Offer TOTP-based 2FA with recovery codes as a fallback.

**Status: Implemented**

- TOTP setup with QR code and manual code
- Verification with 6-digit code
- 10 Argon2id-hashed recovery codes generated on activation
- Disable flow with one-time token verification

---

## 12. Rate limiting

Limit the number of requests per IP/user to prevent brute force and credential stuffing attacks.

**Recommended:** `@nestjs/throttler` with a storage backend (e.g., Redis).

**Status: Implemented**

- `@nestjs/throttler` with Redis storage backend (`@nest-lab/throttler-storage-redis`)
- Custom `AuthThrottleGuard` with three-dimensional limiting: by IP (`origin`), by email (`identity`), and by IP+email (`combined`)
- Applied to sign-in and auth-sensitive endpoints via `@UseGuards(AuthThrottleGuard)`
- Configurable via `THROTTLE_TTL_SECONDS`, `THROTTLE_ORIGIN_LIMIT`, `THROTTLE_IDENTITY_LIMIT`, `THROTTLE_COMBINED_LIMIT`

---

## 13. Account lockout

After N consecutive failed login attempts on a specific account, temporarily lock the account regardless of the source IP.

**Status: Missing**

- No failed attempt counter
- No lockout mechanism

---

## 14. Input validation

Never trust client input. Validate and sanitize all incoming data at the DTO level.

**Status: Implemented**

- Global `ValidationPipe` with `whitelist: true`
- `class-validator` decorators on all input DTOs (`@IsEmail()`, `@IsString()`, `@IsNotEmpty()`, `@Length()`, etc.)

---

## 15. SQL injection protection

Always use parameterized queries or a secure ORM. Never interpolate user input into raw SQL.

**Status: Implemented**

- TypeORM used exclusively with repository methods
- No raw SQL queries found

---

## 16. Cookie security (XSS / CSRF)

Refresh token cookies must be configured to prevent client-side access and cross-site attacks.

**Status: Implemented**

- `httpOnly: true` — prevents JavaScript access
- `secure: true` — HTTPS only
- `sameSite: 'strict'` — blocks cross-site requests

---

## 17. Security headers (Helmet)

HTTP security headers protect against clickjacking, MIME sniffing, and other browser-level attacks.

**Recommended:** Use the `helmet` middleware for `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, etc.

**Status: Missing**

- No `helmet` dependency
- No security headers configured in `main.ts`

---

## 18. CORS configuration

Explicitly define which origins are allowed to call the API to prevent unauthorized cross-origin requests.

**Status: Missing**

- No `app.enableCors()` call
- No CORS middleware configured

---

## 19. Request payload size limiting

Limit the size of incoming request bodies to prevent denial-of-service attacks with oversized payloads.

**Status: Missing**

- No body parser size limit configured in `main.ts`

---

## 20. Logging and monitoring

Log authentication events (failed logins, password changes, token usage, suspicious IPs) for audit and incident response.

**Status: Missing**

- No auth event logging
- No audit trail

---

## 21. Dependency vulnerabilities

Regularly audit dependencies for known CVEs. Integrate `npm audit` into CI/CD.

**Status: Missing**

- No `npm audit` script or security scanning tool configured
