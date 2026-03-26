import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { HasMinLengthConstraint } from './has-min-length.decorator';

describe('HasMinLengthConstraint', () => {
  function createConstraint(minLength = 8) {
    const config = { ...defaultTenantConfig, passwordMinLength: minLength };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new HasMinLengthConstraint(mockSettingsService);
  }

  it('should accept a password meeting the minimum length', async () => {
    const constraint = createConstraint(8);
    expect(await constraint.validate('12345678')).toBe(true);
  });

  it('should reject a password shorter than the minimum length', async () => {
    const constraint = createConstraint(8);
    expect(await constraint.validate('1234567')).toBe(false);
  });

  it('should respect a custom minimum length', async () => {
    const constraint = createConstraint(12);
    expect(await constraint.validate('12345678')).toBe(false);
    expect(await constraint.validate('123456789012')).toBe(true);
  });

  it('should reject non-string values', async () => {
    const constraint = createConstraint();
    expect(await constraint.validate(undefined)).toBe(false);
    expect(await constraint.validate(null)).toBe(false);
    expect(await constraint.validate(123)).toBe(false);
  });

  it('should include the configured length in the default message', async () => {
    const constraint = createConstraint(12);
    await constraint.validate('short');
    expect(constraint.defaultMessage()).toBe(
      'Password must contain at least 12 characters'
    );
  });
});
