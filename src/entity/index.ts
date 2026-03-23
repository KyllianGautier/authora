import { PasswordEntity } from './password.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { RegistrationEntity } from './registration.entity';
import { TrustedDeviceEntity } from './trusted-device.entity';
import { TwoFactorAuthEntity } from './two-factor-auth.entity';
import { UserEntity } from './user.entity';
import { SignInAttemptEntity } from './sign-in-attempt.entity';
import { TenantEntity } from './tenant.entity';
import { ApiKeyEntity } from './api-key.entity';

export const ENTITIES = [
  ApiKeyEntity,
  PasswordEntity,
  RefreshTokenEntity,
  RegistrationEntity,
  SignInAttemptEntity,
  TenantEntity,
  TrustedDeviceEntity,
  TwoFactorAuthEntity,
  UserEntity
];
