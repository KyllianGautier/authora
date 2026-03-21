import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entity/user.entity';
import { PasswordEntity, PasswordRevocationReason } from '../../entity/password.entity';
import { HashService } from '../hash.service';
import { PASSWORD_EXPIRATION_ENABLED, PASSWORD_MAX_AGE_SEC } from '../../config/constants';

@Injectable()
export class PasswordEntityService {
  constructor(
    @InjectRepository(PasswordEntity)
    private readonly _repository: Repository<PasswordEntity>,
    private readonly _hashService: HashService
  ) {
  }

  async create(data: {
    user: UserEntity;
    clearPassword: string;
  }): Promise<PasswordEntity> {
    const passwordHash = await this._hashService.hash(data.clearPassword);
    return this._repository.save(
      this._repository.create({user: data.user, passwordHash})
    );
  }

  async createFromHash(data: {
    user: UserEntity;
    passwordHash: string;
  }): Promise<PasswordEntity> {
    return this._repository.save(this._repository.create(data));
  }

  async verifyUserPassword(
    user: UserEntity,
    clearPassword: string
  ): Promise<PasswordVerifyResult> {
    const currentPassword = user.passwords.find(
      (password) => !password.revoked
    );

    if (currentPassword === undefined) {
      return 'invalid';
    }

    const isValid = await this._hashService.verify(
      currentPassword.passwordHash,
      clearPassword
    );

    if (!isValid) {
      return 'invalid';
    }

    if (PASSWORD_EXPIRATION_ENABLED && DateTime.fromMillis(currentPassword.createdAt.getTime() + PASSWORD_MAX_AGE_SEC * 1000) < DateTime.utc()) {
      return 'expired';
    }

    return 'valid';
  }

  async revoke(
    user: UserEntity,
    reason: PasswordRevocationReason
  ): Promise<void> {
    await this._repository.update(
      {user: {id: user.id}, revoked: false},
      {revoked: true, revocationReason: reason, revokedAt: DateTime.utc().toJSDate()}
    );
  }

  async changeUserPassword(
    user: UserEntity,
    newClearPassword: string
  ): Promise<PasswordEntity> {
    await this.revoke(user, PasswordRevocationReason.Changed);

    const passwordHash = await this._hashService.hash(newClearPassword);
    return this._repository.save(
      this._repository.create({user, passwordHash})
    );
  }

  async resetUserPassword(
    user: UserEntity,
    newClearPassword: string
  ): Promise<PasswordEntity> {
    await this.revoke(user, PasswordRevocationReason.ForgotAndReset);

    const passwordHash = await this._hashService.hash(newClearPassword);
    return this._repository.save(
      this._repository.create({user, passwordHash})
    );
  }
}

export type PasswordVerifyResult = 'valid' | 'invalid' | 'expired';
