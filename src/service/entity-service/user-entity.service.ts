import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entity/user.entity';

@Injectable()
export class UserEntityService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly _repository: Repository<UserEntity>
  ) {}

  async create(data: Pick<UserEntity, 'email'>): Promise<UserEntity> {
    return this._repository.save(this._repository.create(data));
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this._repository.findOneBy({ id });
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

  async delete(user: UserEntity): Promise<void> {
    await this._repository.remove(user);
  }
}
