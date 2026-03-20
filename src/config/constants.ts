export const EMAIL_QUEUE = 'EMAIL_QUEUE';

// Argon2id hashing
export const HASH_MEMORY_COST = process.env.NODE_ENV === 'test' ? 1024 : 65_536;
export const HASH_TIME_COST = process.env.NODE_ENV === 'test' ? 1 : 3;
export const HASH_PARALLELISM = process.env.NODE_ENV === 'test' ? 1 : 4;

// Throttle
export const THROTTLE_TTL_MS = 60_000;
export const THROTTLE_ORIGIN_LIMIT = 30;
export const THROTTLE_IDENTITY_LIMIT = 10;
export const THROTTLE_COMBINED_LIMIT = 5;

// Delay (timing attack mitigation)
export const ENDPOINT_DELAY_MIN_MS = process.env.NODE_ENV === 'test' ? 1 : 200;
export const ENDPOINT_DELAY_MAX_MS = process.env.NODE_ENV === 'test' ? 2 : 400;

// Token TTLs (seconds)
export const EMAIL_VERIFICATION_TOKEN_TTL_SEC = 86_400;
export const AUTH_SESSION_TTL_SEC = 600;
export const JWT_ACCESS_TOKEN_EXPIRATION_SEC = 900;
export const JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SEC = 86_400;
export const JWT_REFRESH_TOKEN_LONG_EXPIRATION_SEC = 2_592_000;

// One-time token TTLs (seconds)
export const OTT_ACCOUNT_DELETION_TTL_SEC = 3_600;
export const OTT_TWO_FACTOR_AUTH_VERIFY_TTL_SEC = 86_400;
export const OTT_TWO_FACTOR_AUTH_VALIDATE_TTL_SEC = 86_400;
export const OTT_TWO_FACTOR_AUTH_DISABLING_TTL_SEC = 86_400;
export const OTT_FORGOT_PASSWORD_TTL_SEC = 3_600;
export const OTT_MAGIC_LINK_TTL_SEC = 300;
export const OTT_EXCHANGE_TTL_SEC = 300;

// Primary authentication lock
export const PRIMARY_AUTH_MAX_ATTEMPTS = 5;
export const PRIMARY_AUTH_COOLDOWN_SEC = 900;
export const PRIMARY_AUTH_LOCK_ACCOUNT_THRESHOLD = 10;
export const UNLOCK_ON_PASSWORD_RESET = true;

// MFA authentication lock
export const MFA_AUTH_MAX_ATTEMPTS = 3;
export const MFA_AUTH_COOLDOWN_SEC = 300;

// Token reuse detection
export const TOKEN_REUSE_MAX_COMPROMISED_FAMILIES = 3;
export const TOKEN_REUSE_WINDOW_SEC = 86_400;
