import { AccountController } from './account.controller';
import { PasswordController } from './password.controller';
import { SignInController } from './sign-in.controller';
import { SignUpController } from './sign-up.controller';
import { StatusController } from './status.controller';
import { TwoFactorAuthController } from './two-factor-auth.controller';

export const CONTROLLERS = [
  AccountController,
  PasswordController,
  SignInController,
  SignUpController,
  StatusController,
  TwoFactorAuthController
];
