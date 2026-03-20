export enum OneTimeTokenType {
  TwoFactorAuthVerify = 'TWO_FACTOR_AUTH_VERIFY',
  TwoFactorAuthValidate = 'TWO_FACTOR_AUTH_VALIDATE',
  TwoFactorAuthDisabling = 'TWO_FACTOR_AUTH_DISABLING',
  AccountDeletion = 'ACCOUNT_DELETION',
  ForgotPassword = 'FORGOT_PASSWORD',
  MagicLink = 'MAGIC_LINK',
  Exchange = 'EXCHANGE'
}

export interface OneTimeToken {
  userId: string;
  type: OneTimeTokenType;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}
