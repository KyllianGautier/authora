import { OneTimeTokenEntity } from './one-time-token.entity';
import { PasswordEntity } from './password.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { RegistrationEntity } from './registration.entity';
import { TwoFactorAuthEntity } from './two-factor-auth.entity';
import { UserEntity } from './user.entity';

export const ENTITIES = [
  OneTimeTokenEntity,
  PasswordEntity,
  RefreshTokenEntity,
  RegistrationEntity,
  TwoFactorAuthEntity,
  UserEntity
];
