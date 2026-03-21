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
  mfaPolicy: MfaPolicy;
  mfaSetup: boolean;
  mfaVerified: boolean;
  deviceTrusted: boolean;

  // Exchange status:
  exchanged: boolean;

  // Technical info:
  createdAt: string;
  expiresAt: string;
}
