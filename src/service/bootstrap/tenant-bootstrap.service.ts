import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TenantEntityService } from '../entity-service/tenant-entity.service';
import { TenantEntity } from '../../entity/tenant.entity';
import { ConfigService } from '@nestjs/config';


export const DEFAULT_TENANT_SLUG = 'default';

@Injectable()
export class TenantBootstrapService implements OnApplicationBootstrap {
  private _bootstrapPromise: Promise<void> | null = null;

  constructor(
    private readonly _tenantService: TenantEntityService,
    private readonly _configService: ConfigService
  ) {
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this._bootstrapPromise === null) {
      this._bootstrapPromise = this._bootstrap();
    }

    return this._bootstrapPromise;
  }

  private async _bootstrap(): Promise<void> {
    if (this._configService.getOrThrow('ENABLE_MULTI_TENANT')) return;

    const defaultTenant: TenantEntity | null = await this._tenantService.findBySlug(DEFAULT_TENANT_SLUG);

    if (defaultTenant !== null) return;

    await this._tenantService.create(DEFAULT_TENANT_SLUG, 'Default');
  }
}
