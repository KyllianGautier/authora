import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entity/user.entity';
import { PasswordEntity } from '../../entity/password.entity';
import { HashService } from '../hash.service';

@Injectable()
export class PasswordEntityService {
  constructor(
    @InjectRepository(PasswordEntity)
    private readonly _repository: Repository<PasswordEntity>,
    private readonly _hashService: HashService
  ) {}

  async create(data: {
    user: UserEntity;
    clearPassword: string;
  }): Promise<PasswordEntity> {
    const passwordHash = await this._hashService.hash(data.clearPassword);
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

    return this._hashService.verify(
      currentPassword.passwordHash,
      clearPassword
    );
  }

  async updateUserPassword(
    user: UserEntity,
    newClearPassword: string
  ): Promise<PasswordEntity> {
    await this._repository.update(
      { user: { id: user.id }, revoked: false },
      { revoked: true }
    );

    const passwordHash = await this._hashService.hash(newClearPassword);
    return this._repository.save(
      this._repository.create({ user, passwordHash })
    );
  }
}
