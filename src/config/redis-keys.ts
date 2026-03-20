// Auth session
export const AUTH_SESSION_KEY = (sessionId: string) =>
  `auth_session:${sessionId}`;
export const AUTH_SESSION_USER_KEY = (userId: string) =>
  `auth_session:user:${userId}`;

// One-time tokens
export const OTT_KEY = (userId: string, type: string) =>
  `ott:${userId}:${type}`;
export const OTT_EXCHANGE_KEY = (tokenHash: string) =>
  `ott_exchange:${tokenHash}`;

// Token reuse tracking
export const TOKEN_REUSE_KEY = (userId: string) =>
  `token_reuse:${userId}`;
