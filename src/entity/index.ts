import { ApiKeyEntity } from './api-key.entity';
import { AuthoraConfigEntity } from './authora-config.entity';
import { PasswordEntity } from './password.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { RegistrationEntity } from './registration.entity';
import { SignInAttemptEntity } from './sign-in-attempt.entity';
import { TenantEntity } from './tenant.entity';
import { TenantConfigEntity } from './tenant-config.entity';
import { TrustedDeviceEntity } from './trusted-device.entity';
import { MultiFactorAuthEntity } from './multi-factor-auth.entity';
import { UserEntity } from './user.entity';

export const ENTITIES = [
  ApiKeyEntity,
  AuthoraConfigEntity,
  PasswordEntity,
  RefreshTokenEntity,
  RegistrationEntity,
  SignInAttemptEntity,
  TenantEntity,
  TenantConfigEntity,
  TrustedDeviceEntity,
  MultiFactorAuthEntity,
  UserEntity
];
