import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  API_PUBLISHABLE_KEY_PREFIX,
  API_SECRET_KEY_PREFIX,
  ApiKeyEntityService
} from '../entity-service/api-key-entity.service';
import { DEFAULT_TENANT_SLUG, TenantBootstrapService } from './tenant-bootstrap.service';
import { TenantEntityService } from '../entity-service/tenant-entity.service';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class ApiKeyBootstrapService implements OnApplicationBootstrap {
  private readonly _logger = new Logger(ApiKeyBootstrapService.name);
  private _bootstrapPromise: Promise<void> | null = null;

  constructor(
    private readonly _tenantBootstrap: TenantBootstrapService,
    private readonly _apiKeysService: ApiKeyEntityService,
    private readonly _tenantService: TenantEntityService,
    private readonly _configService: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this._bootstrapPromise === null) {
      this._bootstrapPromise = this._bootstrap();
    }

    return this._bootstrapPromise;
  }

  private async _bootstrap(): Promise<void> {
    if (this._configService.getOrThrow('ENABLE_MULTI_TENANT')) return;

    await this._tenantBootstrap.onApplicationBootstrap();

    const defaultTenant = await this._tenantService.findBySlug(DEFAULT_TENANT_SLUG);

    if (defaultTenant === null) {
      throw new Error('Default tenant not found');
    }

    const apiKey = await this._apiKeysService.findActiveForTenant(defaultTenant);

    if (apiKey !== null) return;

    const publishableKey = API_PUBLISHABLE_KEY_PREFIX + randomBytes(32).toString('hex');
    const clearSecretKey = API_SECRET_KEY_PREFIX + randomBytes(32).toString('hex');

    this._logger.warn(
      `API keys generated — publishable: ${publishableKey}, secret: ${clearSecretKey} — save the secret key, it will never be shown again`
    );

    await this._apiKeysService.create(
      defaultTenant,
      publishableKey,
      clearSecretKey
    );
  }
}
