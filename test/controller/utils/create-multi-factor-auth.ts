import * as speakeasy from 'speakeasy';
import { DataSource } from 'typeorm';
import { MultiFactorAuthEntity } from '../../../src/entity/multi-factor-auth.entity';
import { UserEntity } from '../../../src/entity/user.entity';

export async function createMultiFactorAuth(
  dataSource: DataSource,
  user: UserEntity,
  isVerified: boolean
): Promise<MultiFactorAuthEntity> {
  const repo = dataSource.getRepository(MultiFactorAuthEntity);
  const { base32: secret } = speakeasy.generateSecret();

  return repo.save(
    repo.create({ user, secret, isVerified, recoveryCodeHashes: [] })
  );
}
