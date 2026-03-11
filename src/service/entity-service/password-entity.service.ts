import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entity/user.entity';
import { PasswordEntity } from '../../entity/password.entity';

@Injectable()
export class PasswordEntityService {
  constructor(
    @InjectRepository(PasswordEntity)
    private readonly _repository: Repository<PasswordEntity>,
    private readonly _configService: ConfigService
  ) {}

  async create(data: {
    user: UserEntity;
    clearPassword: string;
  }): Promise<PasswordEntity> {
    const passwordHash = await this._hash(data.clearPassword);
    return this._repository.save(
      this._repository.create({ user: data.user, passwordHash })
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
  ): Promise<boolean> {
    const currentPassword = user.passwords.find(
      (password) => !password.revoked
    );

    if (currentPassword === undefined) {
      return false;
    }

    return bcrypt.compare(clearPassword, currentPassword.passwordHash);
  }

  async updateUserPassword(
    user: UserEntity,
    newClearPassword: string
  ): Promise<PasswordEntity> {
    await this._repository.update(
      { user: { id: user.id }, revoked: false },
      { revoked: true }
    );

    const passwordHash = await this._hash(newClearPassword);
    return this._repository.save(
      this._repository.create({ user, passwordHash })
    );
  }

  private async _hash(value: string): Promise<string> {
    const saltRounds =
      this._configService.getOrThrow<number>('HASH_SALT_ROUNDS');
    return bcrypt.hash(value, saltRounds);
  }
}
