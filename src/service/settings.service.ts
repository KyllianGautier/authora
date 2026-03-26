import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.provider';
import {
  SETTINGS_AUTHORA_KEY,
  SETTINGS_TENANT_KEY
} from '../config/redis-keys';
import { defaultAuthoraConfig } from '../config/authora-config';
import { defaultTenantConfig } from '../config/tenant-config';
import {
  AuthoraSetting,
  TenantSetting
} from '../config/settings';
import type {
  AuthoraSettingValue,
  AuthoraSettingsResult,
  TenantSettingValue,
  TenantSettingsResult
} from '../config/settings';
import { AuthoraConfigEntityService } from './entity-service/authora-config-entity.service';
import { TenantConfigEntityService } from './entity-service/tenant-config-entity.service';
import { TenantEntityService } from './entity-service/tenant-entity.service';
import { TenantConfigEntity } from '../entity/tenant-config.entity';

const AUTHORA_KEYS = new Set<string>(Object.values(AuthoraSetting));

@Injectable()
export class SettingsService implements OnApplicationBootstrap {
  private readonly _logger = new Logger(SettingsService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly _redis: Redis,
    private readonly _authoraConfigEntityService: AuthoraConfigEntityService,
    private readonly _tenantConfigEntityService: TenantConfigEntityService,
    private readonly _tenantEntityService: TenantEntityService
  ) {}

  // ── Bootstrap ────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    await this.refreshAuthoraCache();
  }

  // ── Read ─────────────────────────────────────────────

  async get<K extends AuthoraSetting>(key: K): Promise<AuthoraSettingValue<K>>;
  async get<K extends TenantSetting>(key: K, tenantId: string): Promise<TenantSettingValue<K>>;
  async get(key: AuthoraSetting | TenantSetting, tenantId?: string): Promise<unknown> {
    if (AUTHORA_KEYS.has(key)) {
      return this._getAuthora(key as AuthoraSetting);
    }

    return this._getTenant(key as TenantSetting, tenantId!);
  }

  async getMany<K extends AuthoraSetting>(keys: K[]): Promise<AuthoraSettingsResult<K>>;
  async getMany<K extends TenantSetting>(keys: K[], tenantId: string): Promise<TenantSettingsResult<K>>;
  async getMany(keys: (AuthoraSetting | TenantSetting)[], tenantId?: string): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {};

    if (AUTHORA_KEYS.has(keys[0])) {
      return this._getManyAuthora(keys as AuthoraSetting[]);
    }

    return this._getManyTenant(keys as TenantSetting[], tenantId!);
  }

  // ── Write ────────────────────────────────────────────

  async set<K extends AuthoraSetting>(key: K, value: AuthoraSettingValue<K>): Promise<void>;
  async set<K extends TenantSetting>(key: K, value: TenantSettingValue<K>, tenantId: string): Promise<void>;
  async set(key: AuthoraSetting | TenantSetting, value: unknown, tenantId?: string): Promise<void> {
    if (AUTHORA_KEYS.has(key)) {
      const k = key as AuthoraSetting;
      const active = await this._authoraConfigEntityService.findActive();

      if (active === null) {
        throw new NotFoundException('No active Authora config found');
      }

      await this._authoraConfigEntityService.update(active.id, { [k]: value });
      await this._redis.set(SETTINGS_AUTHORA_KEY(k), this._serialize(value));
      return;
    }

    const k = key as TenantSetting;
    const tenant = await this._tenantEntityService.findBySlug(tenantId!);

    if (tenant === null) {
      throw new NotFoundException(`Tenant "${tenantId}" not found`);
    }

    const active = await this._tenantConfigEntityService.findActive(tenant);

    if (active === null) {
      throw new NotFoundException(`No active tenant config found for tenant "${tenantId}"`);
    }

    await this._tenantConfigEntityService.update(active.id, { [k]: value });
    await this._redis.set(SETTINGS_TENANT_KEY(tenant.id, k), this._serialize(value));
  }

  // ── Activation ───────────────────────────────────────

  async activateAuthoraConfig(id: string): Promise<void> {
    await this._authoraConfigEntityService.activate(id);
    await this.refreshAuthoraCache();
  }

  async activateTenantConfig(
    tenantId: string,
    id: string
  ): Promise<void> {
    const tenant = await this._tenantEntityService.findBySlug(tenantId);

    if (tenant === null) {
      throw new NotFoundException(`Tenant "${tenantId}" not found`);
    }

    await this._tenantConfigEntityService.activate(tenant, id);
    await this.refreshTenantCache(tenant.id);
  }

  // ── Cache refresh ────────────────────────────────────

  async refreshAuthoraCache(): Promise<void> {
    const active = await this._authoraConfigEntityService.findActive();

    if (active === null) {
      this._logger.warn('No active Authora config found — skipping cache refresh');
      return;
    }

    const pipeline = this._redis.pipeline();

    for (const key of Object.values(AuthoraSetting)) {
      pipeline.set(
        SETTINGS_AUTHORA_KEY(key),
        this._serialize((active as any)[key])
      );
    }

    await pipeline.exec();
  }

  async refreshTenantCache(tenantId: string): Promise<void> {
    const tenant = await this._tenantEntityService.findBySlug(tenantId);

    if (tenant === null) {
      this._logger.warn(`Tenant "${tenantId}" not found — skipping cache refresh`);
      return;
    }

    const active = await this._tenantConfigEntityService.findActive(tenant);

    if (active === null) {
      this._logger.warn(`No active tenant config for "${tenantId}" — skipping cache refresh`);
      return;
    }

    const pipeline = this._redis.pipeline();

    for (const key of Object.values(TenantSetting)) {
      pipeline.set(
        SETTINGS_TENANT_KEY(tenant.id, key),
        this._serialize((active as any)[key])
      );
    }

    await pipeline.exec();
  }

  // ── Private: Authora reads ───────────────────────────

  private async _getAuthora(key: AuthoraSetting): Promise<unknown> {
    const raw = await this._redis.get(SETTINGS_AUTHORA_KEY(key));

    if (raw !== null) {
      return this._deserialize(raw, defaultAuthoraConfig[key]);
    }

    // Cache miss → fallback to SQL
    const active = await this._authoraConfigEntityService.findActive();

    if (active === null) {
      throw new NotFoundException('No active Authora config found');
    }

    // Re-populate the full cache
    await this.refreshAuthoraCache();

    return (active as any)[key];
  }

  private async _getManyAuthora(keys: AuthoraSetting[]): Promise<Record<string, unknown>> {
    const redisKeys = keys.map((k) => SETTINGS_AUTHORA_KEY(k));
    const values = await this._redis.mget(...redisKeys);

    const hasMiss = values.some((v) => v === null);

    if (!hasMiss) {
      const result: Record<string, unknown> = {};
      for (let i = 0; i < keys.length; i++) {
        result[keys[i]] = this._deserialize(values[i]!, defaultAuthoraConfig[keys[i]]);
      }
      return result;
    }

    // Cache miss → fallback to SQL
    const active = await this._authoraConfigEntityService.findActive();

    if (active === null) {
      throw new NotFoundException('No active Authora config found');
    }

    await this.refreshAuthoraCache();

    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = (active as any)[key];
    }
    return result;
  }

  // ── Private: Tenant reads ────────────────────────────

  private async _getTenant(key: TenantSetting, tenantId: string): Promise<unknown> {
    const raw = await this._redis.get(SETTINGS_TENANT_KEY(tenantId, key));

    if (raw !== null) {
      return this._deserialize(raw, defaultTenantConfig[key]);
    }

    // Cache miss → fallback to SQL
    const { config, resolvedTenantId } = await this._findActiveTenantConfig(tenantId);

    // Re-populate the full cache
    await this._refreshTenantCacheFromEntity(config, resolvedTenantId);

    return (config as any)[key];
  }

  private async _getManyTenant(keys: TenantSetting[], tenantId: string): Promise<Record<string, unknown>> {
    const redisKeys = keys.map((k) => SETTINGS_TENANT_KEY(tenantId, k));
    const values = await this._redis.mget(...redisKeys);

    const hasMiss = values.some((v) => v === null);

    if (!hasMiss) {
      const result: Record<string, unknown> = {};
      for (let i = 0; i < keys.length; i++) {
        result[keys[i]] = this._deserialize(values[i]!, defaultTenantConfig[keys[i]]);
      }
      return result;
    }

    // Cache miss → fallback to SQL
    const { config, resolvedTenantId } = await this._findActiveTenantConfig(tenantId);

    await this._refreshTenantCacheFromEntity(config, resolvedTenantId);

    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = (config as any)[key];
    }
    return result;
  }

  private async _findActiveTenantConfig(tenantId: string): Promise<{ config: Partial<TenantConfigEntity>; resolvedTenantId: string }> {
    const tenant = await this._tenantEntityService.findBySlug(tenantId);

    if (tenant === null) {
      throw new NotFoundException(`Tenant "${tenantId}" not found`);
    }

    const active = await this._tenantConfigEntityService.findActive(tenant);

    if (active === null) {
      throw new NotFoundException(`No active tenant config found for tenant "${tenantId}"`);
    }

    return { config: active, resolvedTenantId: tenant.id };
  }

  private async _refreshTenantCacheFromEntity(
    active: Record<string, unknown>,
    tenantId: string
  ): Promise<void> {
    const pipeline = this._redis.pipeline();

    for (const key of Object.values(TenantSetting)) {
      pipeline.set(
        SETTINGS_TENANT_KEY(tenantId, key),
        this._serialize(active[key])
      );
    }

    await pipeline.exec();
  }

  // ── Serialization ────────────────────────────────────

  private _serialize(value: unknown): string {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  }

  private _deserialize(raw: string, reference: unknown): unknown {
    if (typeof reference === 'boolean') return raw === 'true';
    if (typeof reference === 'number') return Number(raw);
    return raw;
  }
}
