import { AuthoraConfigBootstrapService } from './authora-config-bootstrap.service';
import type { AuthoraConfigEntityService } from '../entity-service/authora-config-entity.service';

describe('AuthoraConfigBootstrapService', () => {
  let service: AuthoraConfigBootstrapService;
  let mockAuthoraConfigEntityService: Partial<AuthoraConfigEntityService>;

  beforeEach(() => {
    mockAuthoraConfigEntityService = {
      findActive: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'config-1', name: 'Default', isActive: true })
    };

    service = new AuthoraConfigBootstrapService(
      mockAuthoraConfigEntityService as AuthoraConfigEntityService
    );
  });

  it('should create a default config with name Default and isActive true on first boot', async () => {
    await service.onApplicationBootstrap();

    expect(mockAuthoraConfigEntityService.create).toHaveBeenCalledWith({
      name: 'Default',
      isActive: true
    });
  });

  it('should be idempotent — not create if an active config already exists', async () => {
    (mockAuthoraConfigEntityService.findActive as jest.Mock).mockResolvedValue({
      id: 'existing', name: 'Default', isActive: true
    });

    await service.onApplicationBootstrap();

    expect(mockAuthoraConfigEntityService.create).not.toHaveBeenCalled();
  });
});
