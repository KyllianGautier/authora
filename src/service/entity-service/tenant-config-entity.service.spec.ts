import { TenantConfigEntityService } from './tenant-config-entity.service';

describe('TenantConfigEntityService', () => {
  let service: TenantConfigEntityService;
  let mockManager: any;
  let mockRepository: any;

  const fakeTenant = { id: 'tenant-uuid-123' } as any;

  beforeEach(() => {
    mockManager = {
      update: jest.fn().mockResolvedValue(undefined)
    };

    mockRepository = {
      manager: {
        transaction: jest.fn((cb: (manager: any) => Promise<void>) => cb(mockManager))
      },
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((data: any) => data),
      findOneBy: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined)
    };

    service = new TenantConfigEntityService(mockRepository);
  });

  describe('activate', () => {
    it('should deactivate all configs for the tenant then activate the target one', async () => {
      await service.activate(fakeTenant, 'config-2');

      expect(mockManager.update).toHaveBeenCalledTimes(2);
      expect(mockManager.update).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        { tenant: { id: 'tenant-uuid-123' } },
        { isActive: false }
      );
      expect(mockManager.update).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'config-2',
        { isActive: true }
      );
    });

    it('should only deactivate configs for the given tenant, not all tenants', async () => {
      await service.activate(fakeTenant, 'config-2');

      const firstCallWhere = mockManager.update.mock.calls[0][1];
      expect(firstCallWhere).toEqual({ tenant: { id: 'tenant-uuid-123' } });
    });

    it('should run both updates inside a single transaction', async () => {
      await service.activate(fakeTenant, 'config-2');

      expect(mockRepository.manager.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
