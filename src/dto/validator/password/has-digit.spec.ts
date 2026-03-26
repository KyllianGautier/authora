import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { HasDigitConstraint } from './has-digit.decorator';

describe('HasDigitConstraint', () => {
  function createConstraint(enabled = true) {
    const config = { ...defaultTenantConfig, passwordRequireDigit: enabled };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new HasDigitConstraint(mockSettingsService);
  }

  it('should accept a password with a digit', async () => {
    expect(await createConstraint().validate('abc1')).toBe(true);
  });

  it('should reject a password without a digit', async () => {
    expect(await createConstraint().validate('abcdef')).toBe(false);
  });

  it('should accept any password when disabled', async () => {
    expect(await createConstraint(false).validate('abcdef')).toBe(true);
  });

  it('should reject non-string values', async () => {
    expect(await createConstraint().validate(undefined)).toBe(false);
  });
});
