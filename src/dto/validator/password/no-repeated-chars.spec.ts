import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { NoRepeatedCharsConstraint } from './no-repeated-chars.decorator';

describe('NoRepeatedCharsConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      ...defaultTenantConfig,
      passwordForbidRepeatedChars: enabled
    };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new NoRepeatedCharsConstraint(mockSettingsService);
  }

  it('should reject 3+ identical characters', async () => {
    const constraint = createConstraint();
    expect(await constraint.validate('Xaaa55X!')).toBe(false);
    expect(await constraint.validate('X111abX!')).toBe(false);
  });

  it('should be case-insensitive', async () => {
    expect(await createConstraint().validate('XaAa55X!')).toBe(false);
  });

  it('should accept 2 identical characters (below threshold)', async () => {
    expect(await createConstraint().validate('Xaa5x5X!')).toBe(true);
  });

  it('should accept any password when disabled', async () => {
    expect(await createConstraint(false).validate('Xaaa55X!')).toBe(true);
  });
});
