import { MfaPolicy } from '../redis-model/auth-session.model';

export const TENANT_CONFIG = 'TENANT_CONFIG';

export interface AuthoraTenantConfig {
  // Authentication
  jwtAccessTokenExpirationSec: number;
  jwtRefreshTokenShortExpirationSec: number;
  jwtRefreshTokenLongExpirationSec: number;

  // Primary auth lock
  primaryAuthMaxAttempts: number;
  primaryAuthCooldownSec: number;
  primaryAuthLockAccountThreshold: number;
  unlockOnPasswordReset: boolean;

  // MFA
  mfaPolicy: MfaPolicy;
  mfaAuthMaxAttempts: number;
  mfaAuthCooldownSec: number;

  // Password
  passwordExpirationEnabled: boolean;
  passwordMaxAgeSec: number;
  passwordMinLength: number;
  passwordRequireDigit: boolean;
  passwordRequireSpecialChar: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireUppercase: boolean;
  passwordForbidSequentialChars: boolean;
  passwordForbidRepeatedChars: boolean;
  passwordForbidKeyboardSequence: boolean;
  passwordForbidUserInfo: boolean;
  passwordForbidCommonPassword: boolean;

  // Trusted devices
  trustedDeviceTtlSec: number;
  deviceFingerprintCookieMaxAgeDays: number;

  // Token reuse detection
  tokenReuseMaxCompromisedFamilies: number;
  tokenReuseWindowSec: number;

  // One-time token TTLs (seconds)
  ottEmailVerificationTtlSec: number;
  ottAccountDeletionTtlSec: number;
  ottTwoFactorAuthVerifyTtlSec: number;
  ottTwoFactorAuthValidateTtlSec: number;
  ottTwoFactorAuthDisablingTtlSec: number;
  ottForgotPasswordTtlSec: number;
  ottMagicLinkTtlSec: number;

  // Email notifications
  emailNewDeviceSignIn: boolean;
  emailSuspiciousActivity: boolean;
  emailAccountLocked: boolean;
  emailMfaSetup: boolean;
}

export const defaultTenantConfig: AuthoraTenantConfig = {
  // Authentication
  jwtAccessTokenExpirationSec: 900,
  jwtRefreshTokenShortExpirationSec: 86_400,
  jwtRefreshTokenLongExpirationSec: 2_592_000,

  // Primary auth lock
  primaryAuthMaxAttempts: 5,
  primaryAuthCooldownSec: 900,
  primaryAuthLockAccountThreshold: 10,
  unlockOnPasswordReset: true,

  // MFA
  mfaPolicy: 'DISABLED',
  mfaAuthMaxAttempts: 3,
  mfaAuthCooldownSec: 300,

  // Password
  passwordExpirationEnabled: false,
  passwordMaxAgeSec: 5_184_000, // 60 days
  passwordMinLength: 8,
  passwordRequireDigit: true,
  passwordRequireSpecialChar: true,
  passwordRequireLowercase: true,
  passwordRequireUppercase: true,
  passwordForbidSequentialChars: false,
  passwordForbidRepeatedChars: false,
  passwordForbidKeyboardSequence: false,
  passwordForbidUserInfo: true,
  passwordForbidCommonPassword: false,

  // Trusted devices
  trustedDeviceTtlSec: 5_184_000, // 60 days
  deviceFingerprintCookieMaxAgeDays: 365,

  // Token reuse detection
  tokenReuseMaxCompromisedFamilies: 3,
  tokenReuseWindowSec: 86_400,

  // One-time token TTLs (seconds)
  ottEmailVerificationTtlSec: 86_400,
  ottAccountDeletionTtlSec: 3_600,
  ottTwoFactorAuthVerifyTtlSec: 86_400,
  ottTwoFactorAuthValidateTtlSec: 86_400,
  ottTwoFactorAuthDisablingTtlSec: 86_400,
  ottForgotPasswordTtlSec: 3_600,
  ottMagicLinkTtlSec: 300,

  // Email notifications
  emailNewDeviceSignIn: true,
  emailSuspiciousActivity: true,
  emailAccountLocked: true,
  emailMfaSetup: true
};

export const testTenantConfig: AuthoraTenantConfig = {
  ...defaultTenantConfig,
  passwordExpirationEnabled: true,
  passwordMaxAgeSec: 60,
  trustedDeviceTtlSec: 60,

  passwordRequireDigit: false,
  passwordRequireSpecialChar: false,
  passwordRequireLowercase: false,
  passwordRequireUppercase: false,
  passwordForbidUserInfo: false
};
