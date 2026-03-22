import { PasswordRevocationReason } from '../entity/password.entity';
import { JobService } from './job.service';
import type { AuthoraTenantConfig } from '../config/tenant-config';
import { defaultTenantConfig } from '../config/tenant-config';

describe('JobService', () => {
  let service: JobService;
  let tenantConfig: AuthoraTenantConfig;

  const mockExecute = jest.fn();
  const mockAndWhere = jest.fn().mockReturnValue({ execute: mockExecute });
  const mockWhere = jest.fn().mockReturnValue({ andWhere: mockAndWhere });
  const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
  const mockRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({ update: mockUpdate })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantConfig = { ...defaultTenantConfig, passwordExpirationEnabled: true };
    service = new JobService(mockRepository as any, tenantConfig);
  });

  it('should not execute when password expiration is disabled', async () => {
    tenantConfig.passwordExpirationEnabled = false;

    await service.revokeExpiredPasswords();

    expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('should revoke expired passwords with correct criteria', async () => {
    mockExecute.mockResolvedValue({ affected: 2 });

    await service.revokeExpiredPasswords();

    expect(mockSet).toHaveBeenCalledWith({
      revoked: true,
      revocationReason: PasswordRevocationReason.Expired,
      revokedAt: expect.any(Date)
    });
    expect(mockWhere).toHaveBeenCalledWith('revoked = false');
    expect(mockAndWhere).toHaveBeenCalledWith(
      'created_at <= :expirationDate',
      { expirationDate: expect.any(Date) }
    );
  });

  it('should not log when no passwords were revoked', async () => {
    mockExecute.mockResolvedValue({ affected: 0 });
    const logSpy = jest.spyOn(service['_logger'], 'log');

    await service.revokeExpiredPasswords();

    expect(logSpy).not.toHaveBeenCalled();
  });
});
