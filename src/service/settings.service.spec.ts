import { NotFoundException } from '@nestjs/common';
import {
  SETTINGS_AUTHORA_KEY,
  SETTINGS_TENANT_KEY
} from '../config/redis-keys';
import { defaultAuthoraConfig } from '../config/authora-config';
import { defaultTenantConfig } from '../config/tenant-config';
import { AuthoraSetting, TenantSetting } from '../config/settings';
import { SettingsService } from './settings.service';
import type { AuthoraConfigEntityService } from './entity-service/authora-config-entity.service';
import type { TenantConfigEntityService } from './entity-service/tenant-config-entity.service';
import type { TenantEntityService } from './entity-service/tenant-entity.service';
import type { AuthoraConfigBootstrapService } from './bootstrap/authora-config-bootstrap.service';
import type { TenantConfigBootstrapService } from './bootstrap/tenant-config-bootstrap.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let store: Map<string, string>;
  let mockRedis: any;
  let mockAuthoraConfigEntityService: Partial<AuthoraConfigEntityService>;
  let mockTenantConfigEntityService: Partial<TenantConfigEntityService>;
  let mockTenantEntityService: Partial<TenantEntityService>;

  const TENANT_ID = 'tenant-uuid-123';
  const TENANT_SLUG = 'default';
  const fakeTenant = { id: TENANT_ID, slug: TENANT_SLUG } as any;

  const fakeAuthoraConfig = {
    id: 'authora-config-1',
    ...defaultAuthoraConfig,
    hashMemoryCost: 2048
  } as any;

  const fakeTenantConfig = {
    id: 'tenant-config-1',
    ...defaultTenantConfig,
    passwordMinLength: 12
  } as any;

  beforeEach(() => {
    store = new Map();

    mockRedis = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      mget: jest.fn((...keys: string[]) =>
        Promise.resolve(keys.map((k) => store.get(k) ?? null))
      ),
      pipeline: jest.fn(() => {
        const commands: Array<() => void> = [];
        return {
          set: (key: string, value: string) => {
            commands.push(() => store.set(key, value));
          },
          exec: () => {
            commands.forEach((cmd) => cmd());
            return Promise.resolve([]);
          }
        };
      })
    };

    mockAuthoraConfigEntityService = {
      findActive: jest.fn().mockResolvedValue(fakeAuthoraConfig),
      update: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn().mockResolvedValue(undefined)
    };

    mockTenantConfigEntityService = {
      findActive: jest.fn().mockResolvedValue(fakeTenantConfig),
      update: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn().mockResolvedValue(undefined)
    };

    mockTenantEntityService = {
      findBySlug: jest.fn().mockResolvedValue(fakeTenant)
    };

    const mockAuthoraConfigBootstrap: Partial<AuthoraConfigBootstrapService> = {
      onApplicationBootstrap: jest.fn().mockResolvedValue(undefined)
    };

    const mockTenantConfigBootstrap: Partial<TenantConfigBootstrapService> = {
      onApplicationBootstrap: jest.fn().mockResolvedValue(undefined)
    };

    service = new SettingsService(
      mockRedis,
      mockAuthoraConfigEntityService as AuthoraConfigEntityService,
      mockTenantConfigEntityService as TenantConfigEntityService,
      mockTenantEntityService as TenantEntityService,
      mockAuthoraConfigBootstrap as AuthoraConfigBootstrapService,
      mockTenantConfigBootstrap as TenantConfigBootstrapService
    );
  });

  // ── get ──────────────────────────────────────────────

  describe('get', () => {
    it('should return the cached value for an authora setting', async () => {
      store.set(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost), '1024');

      const result = await service.get(AuthoraSetting.HashMemoryCost);

      expect(result).toBe(1024);
      expect(mockAuthoraConfigEntityService.findActive).not.toHaveBeenCalled();
    });

    it('should fallback to SQL when authora cache is missing, then repopulate cache', async () => {
      const result = await service.get(AuthoraSetting.HashMemoryCost);

      expect(result).toBe(2048);
      expect(mockAuthoraConfigEntityService.findActive).toHaveBeenCalled();
      expect(store.get(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost))).toBe('2048');
    });

    it('should throw NotFoundException when no active authora config in DB', async () => {
      (mockAuthoraConfigEntityService.findActive as jest.Mock).mockResolvedValue(null);

      await expect(
        service.get(AuthoraSetting.HashMemoryCost)
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the cached value for a tenant setting', async () => {
      store.set(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength), '16');

      const result = await service.get(TenantSetting.PasswordMinLength, TENANT_ID);

      expect(result).toBe(16);
      expect(mockTenantConfigEntityService.findActive).not.toHaveBeenCalled();
    });

    it('should fallback to SQL when tenant cache is missing, then repopulate cache', async () => {
      const result = await service.get(TenantSetting.PasswordMinLength, TENANT_SLUG);

      expect(result).toBe(12);
      expect(mockTenantConfigEntityService.findActive).toHaveBeenCalledTimes(1);
      expect(store.get(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength))).toBe('12');
    });

    it('should throw NotFoundException when tenant is not found', async () => {
      (mockTenantEntityService.findBySlug as jest.Mock).mockResolvedValue(null);

      await expect(
        service.get(TenantSetting.PasswordMinLength, 'unknown')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when no active tenant config in DB', async () => {
      (mockTenantConfigEntityService.findActive as jest.Mock).mockResolvedValue(null);

      await expect(
        service.get(TenantSetting.PasswordMinLength, TENANT_SLUG)
      ).rejects.toThrow(NotFoundException);
    });

    it('should deserialize booleans correctly', async () => {
      store.set(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordRequireDigit), 'true');

      expect(await service.get(TenantSetting.PasswordRequireDigit, TENANT_ID)).toBe(true);
    });

    it('should deserialize false booleans correctly', async () => {
      store.set(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordRequireDigit), 'false');

      expect(await service.get(TenantSetting.PasswordRequireDigit, TENANT_ID)).toBe(false);
    });

    it('should deserialize string values correctly', async () => {
      store.set(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.MfaPolicy), 'REQUIRED');

      expect(await service.get(TenantSetting.MfaPolicy, TENANT_ID)).toBe('REQUIRED');
    });

    it('should not query SQL when cache is warm', async () => {
      // Populate all authora keys in cache
      for (const key of Object.values(AuthoraSetting)) {
        store.set(SETTINGS_AUTHORA_KEY(key), String(defaultAuthoraConfig[key]));
      }

      await service.get(AuthoraSetting.HashMemoryCost);
      await service.get(AuthoraSetting.HashTimeCost);

      expect(mockAuthoraConfigEntityService.findActive).not.toHaveBeenCalled();
    });
  });

  // ── getMany ──────────────────────────────────────────

  describe('getMany', () => {
    it('should return multiple authora settings from cache in a single call', async () => {
      store.set(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost), '4096');
      store.set(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashTimeCost), '5');

      const result = await service.getMany([
        AuthoraSetting.HashMemoryCost,
        AuthoraSetting.HashTimeCost
      ]);

      expect(result).toEqual({ hashMemoryCost: 4096, hashTimeCost: 5 });
      expect(mockAuthoraConfigEntityService.findActive).not.toHaveBeenCalled();
    });

    it('should fallback to SQL if any authora key is missing from cache', async () => {
      store.set(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost), '4096');
      // HashTimeCost is NOT in cache

      const result = await service.getMany([
        AuthoraSetting.HashMemoryCost,
        AuthoraSetting.HashTimeCost
      ]);

      expect(result).toEqual({
        hashMemoryCost: fakeAuthoraConfig.hashMemoryCost,
        hashTimeCost: fakeAuthoraConfig.hashTimeCost
      });
      expect(mockAuthoraConfigEntityService.findActive).toHaveBeenCalled();
    });

    it('should return multiple tenant settings from cache', async () => {
      store.set(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength), '16');
      store.set(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordRequireDigit), 'false');

      const result = await service.getMany([
        TenantSetting.PasswordMinLength,
        TenantSetting.PasswordRequireDigit
      ], TENANT_ID);

      expect(result).toEqual({ passwordMinLength: 16, passwordRequireDigit: false });
    });

    it('should fallback to SQL if any tenant key is missing from cache', async () => {
      // Nothing in cache

      const result = await service.getMany([
        TenantSetting.PasswordMinLength,
        TenantSetting.PasswordRequireDigit
      ], TENANT_SLUG);

      expect(result.passwordMinLength).toBe(fakeTenantConfig.passwordMinLength);
      expect(mockTenantConfigEntityService.findActive).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when no active authora config on cache miss', async () => {
      (mockAuthoraConfigEntityService.findActive as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getMany([AuthoraSetting.HashMemoryCost])
      ).rejects.toThrow(NotFoundException);
    });

    it('should return an empty object for an empty keys array', async () => {
      const result = await service.getMany([] as AuthoraSetting[]);

      expect(result).toEqual({});
    });

    it('should use mget for a single Redis round-trip', async () => {
      store.set(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost), '4096');
      store.set(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashTimeCost), '5');

      await service.getMany([
        AuthoraSetting.HashMemoryCost,
        AuthoraSetting.HashTimeCost
      ]);

      expect(mockRedis.mget).toHaveBeenCalledTimes(1);
    });
  });

  // ── set ──────────────────────────────────────────────

  describe('set', () => {
    it('should update the authora config entity and Redis cache', async () => {
      await service.set(AuthoraSetting.HashMemoryCost, 4096);

      expect(mockAuthoraConfigEntityService.update).toHaveBeenCalledWith('authora-config-1', {
        hashMemoryCost: 4096
      });
      expect(store.get(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost))).toBe('4096');
    });

    it('should throw NotFoundException when no active authora config exists', async () => {
      (mockAuthoraConfigEntityService.findActive as jest.Mock).mockResolvedValue(null);

      await expect(
        service.set(AuthoraSetting.HashMemoryCost, 4096)
      ).rejects.toThrow(NotFoundException);
    });

    it('should update the tenant config entity and Redis cache', async () => {
      await service.set(TenantSetting.PasswordMinLength, 16, TENANT_SLUG);

      expect(mockTenantConfigEntityService.update).toHaveBeenCalledWith('tenant-config-1', {
        passwordMinLength: 16
      });
      expect(store.get(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength))).toBe('16');
    });

    it('should throw NotFoundException when tenant is not found', async () => {
      (mockTenantEntityService.findBySlug as jest.Mock).mockResolvedValue(null);

      await expect(
        service.set(TenantSetting.PasswordMinLength, 16, 'unknown')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when no active tenant config exists', async () => {
      (mockTenantConfigEntityService.findActive as jest.Mock).mockResolvedValue(null);

      await expect(
        service.set(TenantSetting.PasswordMinLength, 16, TENANT_SLUG)
      ).rejects.toThrow(NotFoundException);
    });

    it('should serialize booleans as true/false strings', async () => {
      await service.set(TenantSetting.PasswordRequireDigit, true, TENANT_SLUG);

      expect(store.get(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordRequireDigit))).toBe('true');
    });
  });

  // ── activateAuthoraConfig ────────────────────────────

  describe('activateAuthoraConfig', () => {
    it('should activate the config and refresh the cache', async () => {
      await service.activateAuthoraConfig('authora-config-1');

      expect(mockAuthoraConfigEntityService.activate).toHaveBeenCalledWith('authora-config-1');
      expect(store.get(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost))).toBe('2048');
      expect(store.get(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashTimeCost)))
        .toBe(String(fakeAuthoraConfig.hashTimeCost));
    });

    it('should replace old cache values with the new config values', async () => {
      store.set(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost), '999');

      await service.activateAuthoraConfig('authora-config-1');

      expect(store.get(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost))).toBe('2048');
    });
  });

  // ── activateTenantConfig ─────────────────────────────

  describe('activateTenantConfig', () => {
    it('should activate the config and refresh the cache', async () => {
      await service.activateTenantConfig(TENANT_SLUG, 'tenant-config-1');

      expect(mockTenantConfigEntityService.activate).toHaveBeenCalledWith(fakeTenant, 'tenant-config-1');
      expect(store.get(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength))).toBe('12');
    });

    it('should replace old cache values with the new config values', async () => {
      store.set(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength), '999');

      await service.activateTenantConfig(TENANT_SLUG, 'tenant-config-1');

      expect(store.get(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength))).toBe('12');
    });

    it('should throw NotFoundException when tenant is not found', async () => {
      (mockTenantEntityService.findBySlug as jest.Mock).mockResolvedValue(null);

      await expect(
        service.activateTenantConfig('unknown', 'config-1')
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── refreshAuthoraCache ──────────────────────────────

  describe('refreshAuthoraCache', () => {
    it('should populate Redis with all authora settings from the active config', async () => {
      await service.refreshAuthoraCache();

      expect(store.get(SETTINGS_AUTHORA_KEY(AuthoraSetting.HashMemoryCost))).toBe('2048');
      expect(store.size).toBe(Object.values(AuthoraSetting).length);
    });

    it('should not populate Redis when no active config exists', async () => {
      (mockAuthoraConfigEntityService.findActive as jest.Mock).mockResolvedValue(null);

      await service.refreshAuthoraCache();

      expect(store.size).toBe(0);
    });
  });

  // ── refreshTenantCache ───────────────────────────────

  describe('refreshTenantCache', () => {
    it('should populate Redis with all tenant settings from the active config', async () => {
      await service.refreshTenantCache(TENANT_SLUG);

      expect(store.get(SETTINGS_TENANT_KEY(TENANT_ID, TenantSetting.PasswordMinLength))).toBe('12');
    });

    it('should not populate Redis when tenant is not found', async () => {
      (mockTenantEntityService.findBySlug as jest.Mock).mockResolvedValue(null);

      await service.refreshTenantCache('unknown');

      expect(store.size).toBe(0);
    });

    it('should not populate Redis when no active tenant config exists', async () => {
      (mockTenantConfigEntityService.findActive as jest.Mock).mockResolvedValue(null);

      await service.refreshTenantCache(TENANT_SLUG);

      expect(store.size).toBe(0);
    });
  });

  // ── onApplicationBootstrap ───────────────────────────

  describe('onApplicationBootstrap', () => {
    it('should refresh the authora cache on bootstrap', async () => {
      await service.onApplicationBootstrap();

      expect(mockAuthoraConfigEntityService.findActive).toHaveBeenCalled();
      expect(store.size).toBe(Object.values(AuthoraSetting).length);
    });
  });
});
