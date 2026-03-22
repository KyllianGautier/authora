import { PasswordEntityService } from './password-entity.service';
import { RefreshTokenEntityService } from './refresh-token-entity.service';
import { SignInAttemptEntityService } from './sign-in-attempt-entity.service';
import { RegistrationEntityService } from './registration-entity.service';
import { TrustedDeviceEntityService } from './trusted-device-entity.service';
import { TwoFactorAuthEntityService } from './two-factor-auth-entity.service';
import { UserEntityService } from './user-entity.service';

export const ENTITY_SERVICES = [
  PasswordEntityService,
  RefreshTokenEntityService,
  SignInAttemptEntityService,
  RegistrationEntityService,
  TrustedDeviceEntityService,
  TwoFactorAuthEntityService,
  UserEntityService
];
