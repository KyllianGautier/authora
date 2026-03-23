import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthoraConfigEntity } from '../../entity/authora-config.entity';

@Injectable()
export class AuthoraConfigEntityService {
  constructor(
    @InjectRepository(AuthoraConfigEntity)
    private readonly _repository: Repository<AuthoraConfigEntity>
  ) {}

  async create(data: Partial<AuthoraConfigEntity>): Promise<AuthoraConfigEntity> {
    return this._repository.save(this._repository.create(data));
  }

  async findActive(): Promise<AuthoraConfigEntity | null> {
    return this._repository.findOneBy({ isActive: true });
  }

  async findById(id: string): Promise<AuthoraConfigEntity | null> {
    return this._repository.findOneBy({ id });
  }

  async findAll(): Promise<AuthoraConfigEntity[]> {
    return this._repository.find({ order: { createdAt: 'DESC' } });
  }

  async update(
    id: string,
    data: Partial<AuthoraConfigEntity>
  ): Promise<void> {
    await this._repository.update(id, data);
  }

  async activate(id: string): Promise<void> {
    await this._repository.manager.transaction(async (manager) => {
      await manager.update(AuthoraConfigEntity, {}, { isActive: false });
      await manager.update(AuthoraConfigEntity, id, { isActive: true });
    });
  }

  async delete(id: string): Promise<void> {
    await this._repository.delete(id);
  }
}
