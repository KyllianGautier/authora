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

@Injectable()
export class UserEntityService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly _repository: Repository<UserEntity>,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
  ) {}

  async create(data: Pick<UserEntity, 'email'>): Promise<UserEntity> {
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

  async existsByEmail(email: string): Promise<boolean> {
    return this._repository.existsBy({ email });
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
      failedPasswordAttempts: 0,
      lastFailedPasswordAt: null,
      failedMfaAttempts: 0,
      lastFailedMfaAt: null
    });
  }

  async recordFailedPasswordAttempt(user: UserEntity): Promise<number> {
    const now = DateTime.utc();

    const result = await this._repository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        failedPasswordAttempts: () => 'failed_password_attempts + 1',
        lastFailedPasswordAt: now.toJSDate()
      })
      .where('id = :id', { id: user.id })
      .returning('failed_password_attempts')
      .execute();

    return result.raw[0].failed_password_attempts as number;
  }

  isPasswordTemporarilyLocked(user: UserEntity): boolean {
    return (
      user.failedPasswordAttempts >= this._tenantConfig.primaryAuthMaxAttempts &&
      !this._isCooldownExpired(user.lastFailedPasswordAt, this._tenantConfig.primaryAuthCooldownSec)
    );
  }

  async resetPasswordAttempts(user: UserEntity): Promise<void> {
    await this._repository.update(user.id, {
      failedPasswordAttempts: 0,
      lastFailedPasswordAt: null
    });
  }

  async recordFailedMfaAttempt(user: UserEntity): Promise<number> {
    const now = DateTime.utc();

    const result = await this._repository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        failedMfaAttempts: () => 'failed_mfa_attempts + 1',
        lastFailedMfaAt: now.toJSDate()
      })
      .where('id = :id', { id: user.id })
      .returning('failed_mfa_attempts')
      .execute();

    return result.raw[0].failed_mfa_attempts as number;
  }

  isMfaTemporarilyLocked(user: UserEntity): boolean {
    return (
      user.failedMfaAttempts >= this._tenantConfig.mfaAuthMaxAttempts &&
      !this._isCooldownExpired(user.lastFailedMfaAt, this._tenantConfig.mfaAuthCooldownSec)
    );
  }

  async resetMfaAttempts(user: UserEntity): Promise<void> {
    await this._repository.update(user.id, {
      failedMfaAttempts: 0,
      lastFailedMfaAt: null
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
