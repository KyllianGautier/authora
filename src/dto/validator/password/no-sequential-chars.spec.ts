import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { NoSequentialCharsConstraint } from './no-sequential-chars.decorator';

describe('NoSequentialCharsConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      ...defaultTenantConfig,
      passwordForbidSequentialChars: enabled
    };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new NoSequentialCharsConstraint(mockSettingsService);
  }

  it('should reject ascending letter sequences of 4+', async () => {
    const constraint = createConstraint();
    expect(await constraint.validate('Xabcd5X!')).toBe(false);
    expect(await constraint.validate('Xmnop5X!')).toBe(false);
  });

  it('should reject descending letter sequences of 4+', async () => {
    expect(await createConstraint().validate('Xdcba5X!')).toBe(false);
  });

  it('should reject ascending digit sequences of 4+', async () => {
    expect(await createConstraint().validate('Xa1234X!')).toBe(false);
  });

  it('should reject descending digit sequences of 4+', async () => {
    expect(await createConstraint().validate('Xa9876X!')).toBe(false);
  });

  it('should accept 3 sequential characters (below threshold)', async () => {
    const constraint = createConstraint();
    expect(await constraint.validate('Xabc55X!')).toBe(true);
    expect(await constraint.validate('Xa123xX!')).toBe(true);
  });

  it('should be case-insensitive', async () => {
    const constraint = createConstraint();
    expect(await constraint.validate('XABCD5x!')).toBe(false);
    expect(await constraint.validate('XaBcD5x!')).toBe(false);
  });

  it('should not detect sequences across letters and digits', async () => {
    expect(await createConstraint().validate('Xyz012X!')).toBe(true);
  });

  it('should accept any password when disabled', async () => {
    expect(await createConstraint(false).validate('Xabcd5X!')).toBe(true);
  });
});
