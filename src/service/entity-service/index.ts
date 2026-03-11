import { OneTimeTokenEntityService } from './one-time-token-entity.service';
import { PasswordEntityService } from './password-entity.service';
import { RefreshTokenEntityService } from './refresh-token-entity.service';
import { RegistrationEntityService } from './registration-entity.service';
import { TwoFactorAuthEntityService } from './two-factor-auth-entity.service';
import { UserEntityService } from './user-entity.service';

export const ENTITY_SERVICES = [
  OneTimeTokenEntityService,
  PasswordEntityService,
  RefreshTokenEntityService,
  RegistrationEntityService,
  TwoFactorAuthEntityService,
  UserEntityService
];
