import { IntegrationMode } from '../entity/tenant.entity';

export enum MfaPolicy {
  Required = 'REQUIRED',
  Optional = 'OPTIONAL',
  Disabled = 'DISABLED'
}

export interface AuthSession {
  // Identity:
  id: string;
  tenantId: string;
  userId?: string;
  mode: IntegrationMode.FirstParty | IntegrationMode.ThirdParty;

  // First-party compliance:
  deviceFingerprint?: string;

  // Third-party compliance:
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

  // Exchange status:
  exchanged: boolean;

  // Technical info:
  createdAt: string;
  expiresAt: string;
}
