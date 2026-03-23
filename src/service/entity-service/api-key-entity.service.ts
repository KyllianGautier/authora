import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from '../../entity/api-key.entity';
import { TenantEntity } from '../../entity/tenant.entity';
import { createHash } from 'crypto';


export const API_PUBLISHABLE_KEY_PREFIX = 'pk_live_';
export const API_SECRET_KEY_PREFIX = 'sk_live_';

@Injectable()
export class ApiKeyEntityService {

  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly _repository: Repository<ApiKeyEntity>,
  ) {}

  async create(tenant: TenantEntity, publishableKey: string, clearSecretKey: string): Promise<string> {

    await this._repository.save(
      this._repository.create({
        publishableKey,
        secretKeyHash: this._sha256(clearSecretKey),
        tenant
      })
    );

    return clearSecretKey;
  }

  async findActiveForTenant(tenant: TenantEntity): Promise<ApiKeyEntity | null> {
    return this._repository.findOneBy({ tenant: { id: tenant.id } });
  }

  private _sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}