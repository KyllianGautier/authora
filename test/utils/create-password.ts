import { DataSource } from 'typeorm';
import { PasswordEntity } from '../../src/entity/password.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { hashCreate } from './hash';

export async function createPassword(
  dataSource: DataSource,
  user: UserEntity,
  clearPassword: string,
  revoked: boolean
): Promise<PasswordEntity> {
  const repo = dataSource.getRepository(PasswordEntity);
  const passwordHash = await hashCreate(clearPassword);

  return repo.save(
    repo.create({ user, passwordHash, revoked })
  );
}
