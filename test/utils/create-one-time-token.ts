import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../src/entity/one-time-token.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { hashCreate } from './hash';

export const FAKE_ONE_TIME_TOKEN = 'fake-one-time-token';

export async function createOneTimeToken(
  dataSource: DataSource,
  user: UserEntity,
  type: OneTimeTokenType,
  options?: { expiredAt?: Date }
): Promise<OneTimeTokenEntity> {
  const repo = dataSource.getRepository(OneTimeTokenEntity);
  const tokenHash = await hashCreate(FAKE_ONE_TIME_TOKEN);

  return repo.save(
    repo.create({
      user,
      type,
      tokenHash,
      expiredAt:
        options?.expiredAt ?? DateTime.utc().plus({ hours: 1 }).toJSDate()
    })
  );
}
