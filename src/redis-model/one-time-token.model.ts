export enum OneTimeTokenType {
  MultiFactorAuthVerify = 'MULTI_FACTOR_AUTH_VERIFY',
  MultiFactorAuthValidate = 'MULTI_FACTOR_AUTH_VALIDATE',
  MultiFactorAuthDisabling = 'MULTI_FACTOR_AUTH_DISABLING',
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
