import { DataSource } from 'typeorm';
import { UserEntity } from '../../src/entity/user.entity';

export async function createUser(
  dataSource: DataSource,
  email: string
): Promise<UserEntity> {
  const repo = dataSource.getRepository(UserEntity);

  return repo.save(repo.create({ email }));
}
