import { PasswordEntity } from './password.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { RegistrationEntity } from './registration.entity';
import { TwoFactorAuthEntity } from './two-factor-auth.entity';
import { UserEntity } from './user.entity';
import { SignInAttemptEntity } from './sign-in-attempt.entity';

export const ENTITIES = [
  PasswordEntity,
  RefreshTokenEntity,
  RegistrationEntity,
  SignInAttemptEntity,
  TwoFactorAuthEntity,
  UserEntity
];
