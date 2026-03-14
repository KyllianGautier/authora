# Entity state description

## Registration

| id  | email | passwordHash | emailVerificationTokenHash | emailVerificationTokenExpiresAt | createdAt | State description                |
|-----|-------|--------------|----------------------------|---------------------------------|-----------|----------------------------------|
| set | set   | set          | set                        | set                             | set       | User signed up, awaiting verify  |
| set | set   | set          | updated                    | updated                         | set       | Verification email resent        |

Deleted: user verified email (user + password created)

## User

| id  | email | createdAt | State description |
|-----|-------|-----------|-------------------|
| set | set   | set       | Active user       |

Deleted: user deleted account

## Password

| id  | passwordHash | revoked | createdAt | userId | State description |
|-----|--------------|---------|-----------|--------|-------------------|
| set | set          | false   | set       | set    | Current password  |
| set | set          | true    | set       | set    | Previous password |

## RefreshToken

| id  | tokenHash | revoked | expiredAt | createdAt | userId | State description                                           |
|-----|-----------|---------|-----------|-----------|--------|-------------------------------------------------------------|
| set | set       | false   | set       | set       | set    | Active session                                              |
| set | set       | true    | set       | set       | set    | Revoked (rotated, sign-in, password change, or 2fa disable) |

## OneTimeToken

| id  | type | tokenHash | revoked | expiredAt | createdAt | userId | State description    |
|-----|------|-----------|---------|-----------|-----------|--------|----------------------|
| set | set  | set       | false   | set       | set       | set    | Active token         |
| set | set  | set       | true    | set       | set       | set    | Revoked token        |

Deleted: used

## TwoFactorAuth

| id  | secret | isVerified | recoveryCodeHashes | createdAt | userId | State description       |
|-----|--------|------------|--------------------|-----------|--------|-------------------------|
| set | set    | false      | null               | set       | set    | User asked for enabling |
| set | set    | true       | set                | set       | set    | User verified 2fa       |

Deleted: user disabled 2fa
