import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { HasLowercaseConstraint } from './has-lowercase.decorator';

describe('HasLowercaseConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      ...defaultTenantConfig,
      passwordRequireLowercase: enabled
    };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new HasLowercaseConstraint(mockSettingsService);
  }

  it('should accept a password with a lowercase letter', async () => {
    expect(await createConstraint().validate('ABCa')).toBe(true);
  });

  it('should reject a password without a lowercase letter', async () => {
    expect(await createConstraint().validate('ABC123!')).toBe(false);
  });

  it('should accept any password when disabled', async () => {
    expect(await createConstraint(false).validate('ABC123!')).toBe(true);
  });

  it('should reject non-string values', async () => {
    expect(await createConstraint().validate(undefined)).toBe(false);
  });
});
