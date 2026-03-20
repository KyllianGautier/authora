import { AuthController } from './auth.controller';
import { PasswordController } from './password.controller';
import { SignIn2Controller } from './sign-in-2.controller';
import { SignInController } from './sign-in.controller';
import { SignUpController } from './sign-up.controller';
import { StatusController } from './status.controller';
import { TwoFactorAuthController } from './two-factor-auth.controller';

export const CONTROLLERS = [
  AuthController,
  PasswordController,
  SignIn2Controller,
  SignInController,
  SignUpController,
  StatusController,
  TwoFactorAuthController
];
