import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from '../../entity/tenant.entity';
import { TenantConfigEntity } from '../../entity/tenant-config.entity';

@Injectable()
export class TenantConfigEntityService {
  constructor(
    @InjectRepository(TenantConfigEntity)
    private readonly _repository: Repository<TenantConfigEntity>
  ) {}

  async create(
    tenant: TenantEntity,
    data: Partial<TenantConfigEntity>
  ): Promise<TenantConfigEntity> {
    return this._repository.save(
      this._repository.create({ ...data, tenant })
    );
  }

  async findActive(tenant: TenantEntity): Promise<TenantConfigEntity | null> {
    return this._repository.findOneBy({
      tenant: { id: tenant.id },
      isActive: true
    });
  }

  async findById(id: string): Promise<TenantConfigEntity | null> {
    return this._repository.findOneBy({ id });
  }

  async findAllForTenant(tenant: TenantEntity): Promise<TenantConfigEntity[]> {
    return this._repository.find({
      where: { tenant: { id: tenant.id } },
      order: { createdAt: 'DESC' }
    });
  }

  async update(
    id: string,
    data: Partial<TenantConfigEntity>
  ): Promise<void> {
    await this._repository.update(id, data);
  }

  async activate(tenant: TenantEntity, id: string): Promise<void> {
    await this._repository.manager.transaction(async (manager) => {
      await manager.update(
        TenantConfigEntity,
        { tenant: { id: tenant.id } },
        { isActive: false }
      );
      await manager.update(TenantConfigEntity, id, { isActive: true });
    });
  }

  async delete(id: string): Promise<void> {
    await this._repository.delete(id);
  }
}
