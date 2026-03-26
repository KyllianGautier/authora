import { ApiKeyEntityService } from './api-key-entity.service';
import { AuthoraConfigEntityService } from './authora-config-entity.service';
import { PasswordEntityService } from './password-entity.service';
import { RefreshTokenEntityService } from './refresh-token-entity.service';
import { RegistrationEntityService } from './registration-entity.service';
import { SignInAttemptEntityService } from './sign-in-attempt-entity.service';
import { TenantEntityService } from './tenant-entity.service';
import { TenantConfigEntityService } from './tenant-config-entity.service';
import { TrustedDeviceEntityService } from './trusted-device-entity.service';
import { MultiFactorAuthEntityService } from './multi-factor-auth-entity.service';
import { UserEntityService } from './user-entity.service';

export const ENTITY_SERVICES = [
  ApiKeyEntityService,
  AuthoraConfigEntityService,
  PasswordEntityService,
  RefreshTokenEntityService,
  RegistrationEntityService,
  SignInAttemptEntityService,
  TenantEntityService,
  TenantConfigEntityService,
  TrustedDeviceEntityService,
  MultiFactorAuthEntityService,
  UserEntityService
];
