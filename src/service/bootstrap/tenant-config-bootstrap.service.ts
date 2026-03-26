import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantEntityService } from '../entity-service/tenant-entity.service';
import { TenantConfigEntityService } from '../entity-service/tenant-config-entity.service';
import { DEFAULT_TENANT_SLUG, TenantBootstrapService } from './tenant-bootstrap.service';
import { TenantEntity } from '../../entity/tenant.entity';


const DEFAULT_TENANT_CONFIG_NAME = 'Default';

@Injectable()
export class TenantConfigBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly _tenantBootstrap: TenantBootstrapService,
    private readonly _tenantService: TenantEntityService,
    private readonly _tenantConfigService: TenantConfigEntityService,
    private readonly _configService: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this._configService.getOrThrow('ENABLE_MULTI_TENANT')) return;

    // Check that the default tenant has been bootstrapped:
    await this._tenantBootstrap.onApplicationBootstrap();

    const defaultTenant: TenantEntity | null = await this._tenantService.findBySlug(DEFAULT_TENANT_SLUG);

    if (defaultTenant === null) {
      throw new Error('Default tenant not found');
    }

    const active = await this._tenantConfigService.findActive(defaultTenant);

    if (active !== null) return;

    await this._tenantConfigService.create(defaultTenant, {
      name: DEFAULT_TENANT_CONFIG_NAME,
      isActive: true
    });
  }
}
