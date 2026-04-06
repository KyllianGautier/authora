import { AccountController } from './account.controller';
import { MultiFactorAuthController } from './multi-factor-auth.controller';
import { PasswordController } from './password.controller';
import { SignInController } from './sign-in.controller';
import { SignUpController } from './sign-up.controller';
import { StatusController } from './status.controller';
import { AdminController } from './admin.controller';
import { TenantAdminController } from './tenant-admin.controller';

export const CONTROLLERS = [
  AccountController,
  MultiFactorAuthController,
  PasswordController,
  SignInController,
  SignUpController,
  StatusController,
  AdminController,
  TenantAdminController
];
