import { DataSource } from 'typeorm';
import { PasswordEntity } from '../../../src/entity/password.entity';
import { UserEntity } from '../../../src/entity/user.entity';

export async function expirePassword(
  dataSource: DataSource,
  user: UserEntity
): Promise<void> {
  await dataSource.getRepository(PasswordEntity).update(
    { user: { id: user.id }, revoked: false },
    { createdAt: new Date('2000-01-01') }
  );
}
