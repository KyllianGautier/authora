import { DataSource } from 'typeorm';
import { UserEntity } from '../../../src/entity/user.entity';
import { getDefaultTenant } from './get-default-tenant';

export async function createUser(
  dataSource: DataSource,
  email: string
): Promise<UserEntity> {
  const repo = dataSource.getRepository(UserEntity);
  const tenant = await getDefaultTenant(dataSource);

  return repo.save(repo.create({ email, tenant }));
}
