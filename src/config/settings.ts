import type { AuthoraConfig } from './authora-config';
import type { TenantConfig } from './tenant-config';

export enum AuthoraSetting {
  // Argon2id hashing
  HashMemoryCost = 'hashMemoryCost',
  HashTimeCost = 'hashTimeCost',
  HashParallelism = 'hashParallelism',

  // Throttle
  ThrottleTtlMs = 'throttleTtlMs',
  ThrottleOriginLimit = 'throttleOriginLimit',
  ThrottleIdentityLimit = 'throttleIdentityLimit',
  ThrottleCombinedLimit = 'throttleCombinedLimit',

  // Delay (timing attack mitigation)
  EndpointDelayMinMs = 'endpointDelayMinMs',
  EndpointDelayMaxMs = 'endpointDelayMaxMs',

  // Session & exchange TTLs (seconds)
  AuthSessionTtlSec = 'authSessionTtlSec',
  OttExchangeTtlSec = 'ottExchangeTtlSec'
}

export enum TenantSetting {
  // Authentication
  JwtAccessTokenExpirationSec = 'jwtAccessTokenExpirationSec',
  JwtRefreshTokenShortExpirationSec = 'jwtRefreshTokenShortExpirationSec',
  JwtRefreshTokenLongExpirationSec = 'jwtRefreshTokenLongExpirationSec',

  // Primary auth lock
  PrimaryAuthMaxAttempts = 'primaryAuthMaxAttempts',
  PrimaryAuthCooldownSec = 'primaryAuthCooldownSec',
  PrimaryAuthLockAccountThreshold = 'primaryAuthLockAccountThreshold',
  UnlockOnPasswordReset = 'unlockOnPasswordReset',

  // MFA
  MfaPolicy = 'mfaPolicy',
  MfaAuthMaxAttempts = 'mfaAuthMaxAttempts',
  MfaAuthCooldownSec = 'mfaAuthCooldownSec',

  // Password
  PasswordExpirationEnabled = 'passwordExpirationEnabled',
  PasswordMaxAgeSec = 'passwordMaxAgeSec',
  PasswordMinLength = 'passwordMinLength',
  PasswordRequireDigit = 'passwordRequireDigit',
  PasswordRequireSpecialChar = 'passwordRequireSpecialChar',
  PasswordRequireLowercase = 'passwordRequireLowercase',
  PasswordRequireUppercase = 'passwordRequireUppercase',
  PasswordForbidSequentialChars = 'passwordForbidSequentialChars',
  PasswordForbidRepeatedChars = 'passwordForbidRepeatedChars',
  PasswordForbidKeyboardSequence = 'passwordForbidKeyboardSequence',
  PasswordForbidUserInfo = 'passwordForbidUserInfo',
  PasswordForbidCommonPassword = 'passwordForbidCommonPassword',

  // Trusted devices
  TrustedDeviceTtlSec = 'trustedDeviceTtlSec',
  DeviceFingerprintCookieMaxAgeDays = 'deviceFingerprintCookieMaxAgeDays',

  // Token reuse detection
  TokenReuseMaxCompromisedFamilies = 'tokenReuseMaxCompromisedFamilies',
  TokenReuseWindowSec = 'tokenReuseWindowSec',

  // One-time token TTLs (seconds)
  OttEmailVerificationTtlSec = 'ottEmailVerificationTtlSec',
  OttAccountDeletionTtlSec = 'ottAccountDeletionTtlSec',
  OttTwoFactorAuthVerifyTtlSec = 'ottTwoFactorAuthVerifyTtlSec',
  OttTwoFactorAuthValidateTtlSec = 'ottTwoFactorAuthValidateTtlSec',
  OttTwoFactorAuthDisablingTtlSec = 'ottTwoFactorAuthDisablingTtlSec',
  OttForgotPasswordTtlSec = 'ottForgotPasswordTtlSec',
  OttMagicLinkTtlSec = 'ottMagicLinkTtlSec',

  // Email notifications
  EmailNewDeviceSignIn = 'emailNewDeviceSignIn',
  EmailSuspiciousActivity = 'emailSuspiciousActivity',
  EmailAccountLocked = 'emailAccountLocked',
  EmailMfaSetup = 'emailMfaSetup'
}

export type AuthoraSettingValue<K extends AuthoraSetting> =
  AuthoraConfig[K & keyof AuthoraConfig];

export type TenantSettingValue<K extends TenantSetting> =
  TenantConfig[K & keyof TenantConfig];

export type AuthoraSettingsResult<K extends AuthoraSetting> = {
  [P in K]: AuthoraSettingValue<P>;
};

export type TenantSettingsResult<K extends TenantSetting> = {
  [P in K]: TenantSettingValue<P>;
};
