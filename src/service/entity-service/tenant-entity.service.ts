import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationMode, TenantEntity } from '../../entity/tenant.entity';

@Injectable()
export class TenantEntityService {

  constructor(
    @InjectRepository(TenantEntity)
    private readonly _repository: Repository<TenantEntity>,
  ) {}

  async create(
    slug: string,
    name: string
  ): Promise<TenantEntity> {
    return this._repository.save(
      this._repository.create({ slug, name })
    );
  }

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    return this._repository.findOneBy({ slug });
  }
}