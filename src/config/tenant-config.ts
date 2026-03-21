import { MfaPolicy } from '../redis-model/auth-session.model';

export const TENANT_CONFIG = 'TENANT_CONFIG';

export interface AuthoraTenantConfig {
  // MFA
  mfaPolicy: MfaPolicy;

  // Password expiration
  passwordExpirationEnabled: boolean;
  passwordMaxAgeSec: number;

  // Primary auth lock
  primaryAuthMaxAttempts: number;
  primaryAuthCooldownSec: number;
  primaryAuthLockAccountThreshold: number;
  unlockOnPasswordReset: boolean;

  // MFA auth lock
  mfaAuthMaxAttempts: number;
  mfaAuthCooldownSec: number;

  // Token TTLs (seconds)
  authSessionTtlSec: number;
  jwtAccessTokenExpirationSec: number;
  jwtRefreshTokenShortExpirationSec: number;
  jwtRefreshTokenLongExpirationSec: number;

  // One-time token TTLs (seconds)
  emailVerificationTokenTtlSec: number;
  ottAccountDeletionTtlSec: number;
  ottTwoFactorAuthVerifyTtlSec: number;
  ottTwoFactorAuthValidateTtlSec: number;
  ottTwoFactorAuthDisablingTtlSec: number;
  ottForgotPasswordTtlSec: number;
  ottMagicLinkTtlSec: number;
  ottExchangeTtlSec: number;

  // Token reuse detection
  tokenReuseMaxCompromisedFamilies: number;
  tokenReuseWindowSec: number;
}

export const defaultTenantConfig: AuthoraTenantConfig = {
  mfaPolicy: 'DISABLED',

  passwordExpirationEnabled: false,
  passwordMaxAgeSec: 5_184_000, // 60 days

  primaryAuthMaxAttempts: 5,
  primaryAuthCooldownSec: 900,
  primaryAuthLockAccountThreshold: 10,
  unlockOnPasswordReset: true,

  mfaAuthMaxAttempts: 3,
  mfaAuthCooldownSec: 300,

  authSessionTtlSec: 600,
  jwtAccessTokenExpirationSec: 900,
  jwtRefreshTokenShortExpirationSec: 86_400,
  jwtRefreshTokenLongExpirationSec: 2_592_000,

  emailVerificationTokenTtlSec: 86_400,
  ottAccountDeletionTtlSec: 3_600,
  ottTwoFactorAuthVerifyTtlSec: 86_400,
  ottTwoFactorAuthValidateTtlSec: 86_400,
  ottTwoFactorAuthDisablingTtlSec: 86_400,
  ottForgotPasswordTtlSec: 3_600,
  ottMagicLinkTtlSec: 300,
  ottExchangeTtlSec: 300,

  tokenReuseMaxCompromisedFamilies: 3,
  tokenReuseWindowSec: 86_400
};
