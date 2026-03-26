import { UserRole } from '../../entity/user.entity';
import { AdminUserBootstrapService } from './admin-user-bootstrap.service';
import type { TenantEntityService } from '../entity-service/tenant-entity.service';
import type { UserEntityService } from '../entity-service/user-entity.service';
import type { PasswordEntityService } from '../entity-service/password-entity.service';
import type { TenantBootstrapService } from './tenant-bootstrap.service';
import type { ConfigService } from '@nestjs/config';

describe('AdminUserBootstrapService', () => {
  let service: AdminUserBootstrapService;
  let mockTenantBootstrap: Partial<TenantBootstrapService>;
  let mockTenantService: Partial<TenantEntityService>;
  let mockUserEntityService: Partial<UserEntityService>;
  let mockPasswordEntityService: Partial<PasswordEntityService>;
  let mockConfigService: Partial<ConfigService>;

  const fakeTenant = { id: 'tenant-uuid', slug: 'default', name: 'Default' } as any;
  const fakeUser = { id: 'user-uuid', email: 'changeit@changeit.com' } as any;

  beforeEach(() => {
    mockTenantBootstrap = {
      onApplicationBootstrap: jest.fn().mockResolvedValue(undefined)
    };

    mockTenantService = {
      findBySlug: jest.fn().mockResolvedValue(fakeTenant)
    };

    mockUserEntityService = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(fakeUser)
    };

    mockPasswordEntityService = {
      create: jest.fn().mockResolvedValue({} as any)
    };

    mockConfigService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, any> = {
          ENABLE_MULTI_TENANT: false,
          AUTHORA_ADMIN_EMAIL: 'changeit@changeit.com'
        };
        return values[key];
      })
    };

    service = new AdminUserBootstrapService(
      mockTenantBootstrap as TenantBootstrapService,
      mockTenantService as TenantEntityService,
      mockUserEntityService as UserEntityService,
      mockPasswordEntityService as PasswordEntityService,
      mockConfigService as ConfigService
    );
  });

  it('should create the admin user with the configured email', async () => {
    await service.onApplicationBootstrap();

    expect(mockUserEntityService.create).toHaveBeenCalledWith({
      email: 'changeit@changeit.com',
      tenant: fakeTenant,
      role: UserRole.FirstAdmin
    });
  });

  it('should create a password with a random 10-character string', async () => {
    await service.onApplicationBootstrap();

    expect(mockPasswordEntityService.create).toHaveBeenCalledWith({
      user: fakeUser,
      clearPassword: expect.stringMatching(/^[0-9a-f]{10}$/)
    });
  });

  it('should log the generated password once', async () => {
    const warnSpy = jest.spyOn(service['_logger'], 'warn');

    await service.onApplicationBootstrap();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('changeit@changeit.com')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('save the password')
    );
  });

  it('should be idempotent — not create if the admin user already exists', async () => {
    (mockUserEntityService.findByEmail as jest.Mock).mockResolvedValue(fakeUser);

    await service.onApplicationBootstrap();

    expect(mockUserEntityService.create).not.toHaveBeenCalled();
    expect(mockPasswordEntityService.create).not.toHaveBeenCalled();
  });

  it('should skip bootstrap when ENABLE_MULTI_TENANT is true', async () => {
    (mockConfigService.getOrThrow as jest.Mock).mockImplementation((key: string) => {
      if (key === 'ENABLE_MULTI_TENANT') return true;
      return 'value';
    });

    await service.onApplicationBootstrap();

    expect(mockTenantService.findBySlug).not.toHaveBeenCalled();
    expect(mockUserEntityService.create).not.toHaveBeenCalled();
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
