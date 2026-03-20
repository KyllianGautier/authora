import { AuthController } from './auth.controller';
import { PasswordController } from './password.controller';
import { SessionController } from './session.controller';
import { SignInController } from './sign-in.controller';
import { SignUpController } from './sign-up.controller';
import { StatusController } from './status.controller';
import { TwoFactorAuthController } from './two-factor-auth.controller';

export const CONTROLLERS = [
  AuthController,
  PasswordController,
  SessionController,
  SignInController,
  SignUpController,
  StatusController,
  TwoFactorAuthController
];
