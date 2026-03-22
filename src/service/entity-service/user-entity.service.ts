import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { TENANT_CONFIG } from '../../config/tenant-config';
import type { AuthoraTenantConfig } from '../../config/tenant-config';
import {
  isLockReasonEscalation,
  LockReason,
  UserEntity
} from '../../entity/user.entity';
import { TenantEntity } from '../../entity/tenant.entity';

@Injectable()
export class UserEntityService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly _repository: Repository<UserEntity>,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
  ) {}

  async create(data: { email: string, tenant: TenantEntity }): Promise<UserEntity> {
    return this._repository.save(this._repository.create(data));
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this._repository.findOneBy({ id });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this._repository.findOneBy({ email });
  }

  async findByEmailWithPasswords(email: string): Promise<UserEntity | null> {
    return this._repository.findOne({
      where: { email },
      relations: { passwords: true }
    });
  }

  async existsByEmail(email: string, tenant: TenantEntity): Promise<boolean> {
    return this._repository.existsBy({ email, tenant: { id: tenant.id } });
  }

  async lock(user: UserEntity, reason: LockReason): Promise<void> {
    if (!isLockReasonEscalation(user.lockReason, reason)) {
      return;
    }

    await this._repository.update(user.id, {
      isLocked: true,
      lockedAt: DateTime.utc().toJSDate(),
      lockReason: reason
    });
  }

  async unlock(user: UserEntity): Promise<void> {
    await this._repository.update(user.id, {
      isLocked: false,
      lockedAt: null,
      lockReason: null,
    });
  }

  async recordFailedPasswordAttempt(user: UserEntity): Promise<number> {
    const now = DateTime.utc();

    const result = await this._repository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        primaryFailedAttemptCount: () => 'primary_failed_attempt_count + 1',
        primaryLastFailedAttemptAt: now.toJSDate()
      })
      .where('id = :id', { id: user.id })
      .returning('primary_failed_attempt_count')
      .execute();

    return result.raw[0].primary_failed_attempt_count as number;
  }

  isPasswordTemporarilyLocked(user: UserEntity): boolean {
    return (
      user.primaryFailedAttemptCount >= this._tenantConfig.primaryAuthMaxAttempts &&
      !this._isCooldownExpired(user.primaryLastFailedAttemptAt, this._tenantConfig.primaryAuthCooldownSec)
    );
  }

  async resetPasswordAttempts(user: UserEntity): Promise<void> {
    await this._repository.update(user.id, {
      primaryFailedAttemptCount: 0,
      primaryLastFailedAttemptAt: null
    });
  }

  async recordFailedMfaAttempt(user: UserEntity): Promise<number> {
    const now = DateTime.utc();

    const result = await this._repository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        mfaFailedAttemptCount: () => 'mfa_failed_attempt_count + 1',
        mfaLastFailedAttemptAt: now.toJSDate()
      })
      .where('id = :id', { id: user.id })
      .returning('mfa_failed_attempt_count')
      .execute();

    return result.raw[0].mfa_failed_attempt_count as number;
  }

  isMfaTemporarilyLocked(user: UserEntity): boolean {
    return (
      user.mfaFailedAttemptCount >= this._tenantConfig.mfaAuthMaxAttempts &&
      !this._isCooldownExpired(user.mfaLastFailedAttemptAt, this._tenantConfig.mfaAuthCooldownSec)
    );
  }

  async resetMfaAttempts(user: UserEntity): Promise<void> {
    await this._repository.update(user.id, {
      mfaFailedAttemptCount: 0,
      mfaLastFailedAttemptAt: null
    });
  }

  async delete(user: UserEntity): Promise<void> {
    await this._repository.remove(user);
  }

  private _isCooldownExpired(
    lastFailedAt: Date | null,
    cooldownSec: number
  ): boolean {
    if (lastFailedAt === null) {
      return true;
    }
    const elapsed = DateTime.utc().diff(
      DateTime.fromJSDate(lastFailedAt),
      'seconds'
    ).seconds;
    return elapsed >= cooldownSec;
  }
}
