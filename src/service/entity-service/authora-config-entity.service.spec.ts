import { AuthoraConfigEntityService } from './authora-config-entity.service';

describe('AuthoraConfigEntityService', () => {
  let service: AuthoraConfigEntityService;
  let mockManager: any;
  let mockRepository: any;

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

    service = new AuthoraConfigEntityService(mockRepository);
  });

  describe('activate', () => {
    it('should deactivate all configs then activate the target one in a transaction', async () => {
      await service.activate('config-2');

      expect(mockManager.update).toHaveBeenCalledTimes(2);
      expect(mockManager.update).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        {},
        { isActive: false }
      );
      expect(mockManager.update).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'config-2',
        { isActive: true }
      );
    });

    it('should run both updates inside a single transaction', async () => {
      await service.activate('config-2');

      expect(mockRepository.manager.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
