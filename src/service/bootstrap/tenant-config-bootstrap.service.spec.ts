import { TenantConfigBootstrapService } from './tenant-config-bootstrap.service';
import type { TenantConfigEntityService } from '../entity-service/tenant-config-entity.service';
import type { TenantEntityService } from '../entity-service/tenant-entity.service';
import type { TenantBootstrapService } from './tenant-bootstrap.service';
import type { ConfigService } from '@nestjs/config';

describe('TenantConfigBootstrapService', () => {
  let service: TenantConfigBootstrapService;
  let mockTenantBootstrap: Partial<TenantBootstrapService>;
  let mockTenantService: Partial<TenantEntityService>;
  let mockTenantConfigService: Partial<TenantConfigEntityService>;
  let mockConfigService: Partial<ConfigService>;

  const fakeTenant = { id: 'tenant-uuid', slug: 'default', name: 'Default' } as any;

  beforeEach(() => {
    mockTenantBootstrap = {
      onApplicationBootstrap: jest.fn().mockResolvedValue(undefined)
    };

    mockTenantService = {
      findBySlug: jest.fn().mockResolvedValue(fakeTenant)
    };

    mockTenantConfigService = {
      findActive: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'config-1', name: 'Default', isActive: true })
    };

    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue(false)
    };

    service = new TenantConfigBootstrapService(
      mockTenantBootstrap as TenantBootstrapService,
      mockTenantService as TenantEntityService,
      mockTenantConfigService as TenantConfigEntityService,
      mockConfigService as ConfigService
    );
  });

  it('should create a default config for the default tenant on first boot', async () => {
    await service.onApplicationBootstrap();

    expect(mockTenantConfigService.create).toHaveBeenCalledWith(fakeTenant, {
      name: 'Default',
      isActive: true
    });
  });

  it('should be idempotent — not create if an active config already exists', async () => {
    (mockTenantConfigService.findActive as jest.Mock).mockResolvedValue({
      id: 'existing', name: 'Default', isActive: true
    });

    await service.onApplicationBootstrap();

    expect(mockTenantConfigService.create).not.toHaveBeenCalled();
  });

  it('should skip bootstrap when ENABLE_MULTI_TENANT is true', async () => {
    (mockConfigService.getOrThrow as jest.Mock).mockReturnValue(true);

    await service.onApplicationBootstrap();

    expect(mockTenantService.findBySlug).not.toHaveBeenCalled();
    expect(mockTenantConfigService.create).not.toHaveBeenCalled();
  });

  it('should call tenant bootstrap first to ensure the default tenant exists', async () => {
    await service.onApplicationBootstrap();

    expect(mockTenantBootstrap.onApplicationBootstrap).toHaveBeenCalled();
  });

  it('should throw if the default tenant is not found after bootstrap', async () => {
    (mockTenantService.findBySlug as jest.Mock).mockResolvedValue(null);

    await expect(
      service.onApplicationBootstrap()
    ).rejects.toThrow('Default tenant not found');
  });
});
