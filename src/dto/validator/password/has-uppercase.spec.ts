import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { HasUppercaseConstraint } from './has-uppercase.decorator';

describe('HasUppercaseConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      ...defaultTenantConfig,
      passwordRequireUppercase: enabled
    };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new HasUppercaseConstraint(mockSettingsService);
  }

  it('should accept a password with an uppercase letter', async () => {
    expect(await createConstraint().validate('abcA')).toBe(true);
  });

  it('should reject a password without an uppercase letter', async () => {
    expect(await createConstraint().validate('abc123!')).toBe(false);
  });

  it('should accept any password when disabled', async () => {
    expect(await createConstraint(false).validate('abc123!')).toBe(true);
  });

  it('should reject non-string values', async () => {
    expect(await createConstraint().validate(undefined)).toBe(false);
  });
});
