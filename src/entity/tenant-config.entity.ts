import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from 'typeorm';
import { TenantConfig, defaultTenantConfig } from '../config/tenant-config';
import { IntegrationMode } from './integration-mode.enum';
import { TenantEntity } from './tenant.entity';
import { MfaPolicy } from '../redis-model/auth-session.model';

@Entity('tenant_config')
@Unique(['tenant', 'name'])
export class TenantConfigEntity implements TenantConfig {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.configs, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'description', type: 'text', default: '' })
  description: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  // Integration
  @Column({ name: 'integration_mode', type: 'enum', enum: IntegrationMode, default: defaultTenantConfig.integrationMode })
  integrationMode: IntegrationMode;

  @Column({ name: 'authora_ui_base_url', type: 'varchar', default: defaultTenantConfig.authoraUiBaseUrl })
  authoraUiBaseUrl: string;

  // Authentication
  @Column({ name: 'jwt_access_token_expiration_sec', type: 'int', default: defaultTenantConfig.jwtAccessTokenExpirationSec })
  jwtAccessTokenExpirationSec: number;

  @Column({ name: 'jwt_refresh_token_short_expiration_sec', type: 'int', default: defaultTenantConfig.jwtRefreshTokenShortExpirationSec })
  jwtRefreshTokenShortExpirationSec: number;

  @Column({ name: 'jwt_refresh_token_long_expiration_sec', type: 'int', default: defaultTenantConfig.jwtRefreshTokenLongExpirationSec })
  jwtRefreshTokenLongExpirationSec: number;

  // Primary auth lock
  @Column({ name: 'primary_auth_max_attempts', type: 'int', default: defaultTenantConfig.primaryAuthMaxAttempts })
  primaryAuthMaxAttempts: number;

  @Column({ name: 'primary_auth_cooldown_sec', type: 'int', default: defaultTenantConfig.primaryAuthCooldownSec })
  primaryAuthCooldownSec: number;

  @Column({ name: 'primary_auth_lock_account_threshold', type: 'int', default: defaultTenantConfig.primaryAuthLockAccountThreshold })
  primaryAuthLockAccountThreshold: number;

  @Column({ name: 'unlock_on_password_reset', type: 'boolean', default: defaultTenantConfig.unlockOnPasswordReset })
  unlockOnPasswordReset: boolean;

  // MFA
  @Column({ name: 'mfa_policy', type: 'enum', enum: MfaPolicy, default: defaultTenantConfig.mfaPolicy })
  mfaPolicy: MfaPolicy;

  @Column({ name: 'mfa_auth_max_attempts', type: 'int', default: defaultTenantConfig.mfaAuthMaxAttempts })
  mfaAuthMaxAttempts: number;

  @Column({ name: 'mfa_auth_cooldown_sec', type: 'int', default: defaultTenantConfig.mfaAuthCooldownSec })
  mfaAuthCooldownSec: number;

  // Password
  @Column({ name: 'password_expiration_enabled', type: 'boolean', default: defaultTenantConfig.passwordExpirationEnabled })
  passwordExpirationEnabled: boolean;

  @Column({ name: 'password_max_age_sec', type: 'int', default: defaultTenantConfig.passwordMaxAgeSec })
  passwordMaxAgeSec: number;

  @Column({ name: 'password_min_length', type: 'int', default: defaultTenantConfig.passwordMinLength })
  passwordMinLength: number;

  @Column({ name: 'password_require_digit', type: 'boolean', default: defaultTenantConfig.passwordRequireDigit })
  passwordRequireDigit: boolean;

  @Column({ name: 'password_require_special_char', type: 'boolean', default: defaultTenantConfig.passwordRequireSpecialChar })
  passwordRequireSpecialChar: boolean;

  @Column({ name: 'password_require_lowercase', type: 'boolean', default: defaultTenantConfig.passwordRequireLowercase })
  passwordRequireLowercase: boolean;

  @Column({ name: 'password_require_uppercase', type: 'boolean', default: defaultTenantConfig.passwordRequireUppercase })
  passwordRequireUppercase: boolean;

  @Column({ name: 'password_forbid_sequential_chars', type: 'boolean', default: defaultTenantConfig.passwordForbidSequentialChars })
  passwordForbidSequentialChars: boolean;

  @Column({ name: 'password_forbid_repeated_chars', type: 'boolean', default: defaultTenantConfig.passwordForbidRepeatedChars })
  passwordForbidRepeatedChars: boolean;

  @Column({ name: 'password_forbid_keyboard_sequence', type: 'boolean', default: defaultTenantConfig.passwordForbidKeyboardSequence })
  passwordForbidKeyboardSequence: boolean;

  @Column({ name: 'password_forbid_user_info', type: 'boolean', default: defaultTenantConfig.passwordForbidUserInfo })
  passwordForbidUserInfo: boolean;

  @Column({ name: 'password_forbid_common_password', type: 'boolean', default: defaultTenantConfig.passwordForbidCommonPassword })
  passwordForbidCommonPassword: boolean;

  // Trusted devices
  @Column({ name: 'trusted_device_ttl_sec', type: 'int', default: defaultTenantConfig.trustedDeviceTtlSec })
  trustedDeviceTtlSec: number;

  @Column({ name: 'device_fingerprint_cookie_max_age_days', type: 'int', default: defaultTenantConfig.deviceFingerprintCookieMaxAgeDays })
  deviceFingerprintCookieMaxAgeDays: number;

  // Token reuse detection
  @Column({ name: 'token_reuse_max_compromised_families', type: 'int', default: defaultTenantConfig.tokenReuseMaxCompromisedFamilies })
  tokenReuseMaxCompromisedFamilies: number;

  @Column({ name: 'token_reuse_window_sec', type: 'int', default: defaultTenantConfig.tokenReuseWindowSec })
  tokenReuseWindowSec: number;

  // One-time token TTLs (seconds)
  @Column({ name: 'ott_email_verification_ttl_sec', type: 'int', default: defaultTenantConfig.ottEmailVerificationTtlSec })
  ottEmailVerificationTtlSec: number;

  @Column({ name: 'ott_account_deletion_ttl_sec', type: 'int', default: defaultTenantConfig.ottAccountDeletionTtlSec })
  ottAccountDeletionTtlSec: number;

  @Column({ name: 'ott_multi_factor_auth_verify_ttl_sec', type: 'int', default: defaultTenantConfig.ottMultiFactorAuthVerifyTtlSec })
  ottMultiFactorAuthVerifyTtlSec: number;

  @Column({ name: 'ott_multi_factor_auth_validate_ttl_sec', type: 'int', default: defaultTenantConfig.ottMultiFactorAuthValidateTtlSec })
  ottMultiFactorAuthValidateTtlSec: number;

  @Column({ name: 'ott_multi_factor_auth_disabling_ttl_sec', type: 'int', default: defaultTenantConfig.ottMultiFactorAuthDisablingTtlSec })
  ottMultiFactorAuthDisablingTtlSec: number;

  @Column({ name: 'ott_forgot_password_ttl_sec', type: 'int', default: defaultTenantConfig.ottForgotPasswordTtlSec })
  ottForgotPasswordTtlSec: number;

  @Column({ name: 'ott_magic_link_ttl_sec', type: 'int', default: defaultTenantConfig.ottMagicLinkTtlSec })
  ottMagicLinkTtlSec: number;

  // Email notifications
  @Column({ name: 'email_new_device_sign_in', type: 'boolean', default: defaultTenantConfig.emailNewDeviceSignIn })
  emailNewDeviceSignIn: boolean;

  @Column({ name: 'email_suspicious_activity', type: 'boolean', default: defaultTenantConfig.emailSuspiciousActivity })
  emailSuspiciousActivity: boolean;

  @Column({ name: 'email_account_locked', type: 'boolean', default: defaultTenantConfig.emailAccountLocked })
  emailAccountLocked: boolean;

  @Column({ name: 'email_mfa_setup', type: 'boolean', default: defaultTenantConfig.emailMfaSetup })
  emailMfaSetup: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
