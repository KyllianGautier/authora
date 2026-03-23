import { PasswordRevocationReason } from '../entity/password.entity';
import { defaultTenantConfig } from '../config/tenant-config';
import { TenantSetting } from '../config/settings';
import { JobService } from './job.service';
import type { SettingsService } from './settings.service';

describe('JobService', () => {
  let service: JobService;
  let tenantConfig: Record<string, unknown>;

  const mockExecute = jest.fn();
  const mockAndWhere = jest.fn().mockReturnValue({ execute: mockExecute });
  const mockWhere = jest.fn().mockReturnValue({ andWhere: mockAndWhere });
  const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
  const mockRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({ update: mockUpdate })
  };

  const mockSettingsService: Partial<SettingsService> = {
    get: jest.fn().mockImplementation(
      (key: TenantSetting) => Promise.resolve(tenantConfig[key])
    )
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantConfig = { ...defaultTenantConfig, passwordExpirationEnabled: true };
    service = new JobService(
      mockRepository as any,
      mockSettingsService as SettingsService
    );
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
