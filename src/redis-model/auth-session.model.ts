export type MfaPolicy = 'REQUIRED' | 'OPTIONAL' | 'DISABLED';

export interface AuthSession {
  // Identity:
  id: string;
  tenantId: string;
  userId?: string;

  // Third-party compliance:
  mode: 'first-party' | 'third-party';
  appId?: string;
  codeChallenge?: string;
  redirectUri?: string;

  // Primary auth status:
  primaryAuthVerified: boolean;
  rememberMe: boolean;

  // MFA auth status:
  mfaVerified: boolean;
  mfaPolicy: MfaPolicy;
  mfaSetup: boolean;
  deviceTrusted: boolean;

  // Device:
  deviceFingerprint?: string;

  // Exchange status:
  exchanged: boolean;

  // Technical info:
  createdAt: string;
  expiresAt: string;
}
