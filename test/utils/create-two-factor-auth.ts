import * as speakeasy from 'speakeasy';
import { DataSource } from 'typeorm';
import { TwoFactorAuthEntity } from '../../src/entity/two-factor-auth.entity';
import { UserEntity } from '../../src/entity/user.entity';

export async function createTwoFactorAuth(
  dataSource: DataSource,
  user: UserEntity,
  isVerified: boolean
): Promise<TwoFactorAuthEntity> {
  const repo = dataSource.getRepository(TwoFactorAuthEntity);
  const { base32: secret } = speakeasy.generateSecret();

  return repo.save(
    repo.create({ user, secret, isVerified, recoveryCodeHashes: [] })
  );
}
