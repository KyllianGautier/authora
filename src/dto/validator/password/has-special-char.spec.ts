import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import {
  HasSpecialCharConstraint,
  SPECIAL_CHARS
} from './has-special-char.decorator';

describe('HasSpecialCharConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      ...defaultTenantConfig,
      passwordRequireSpecialChar: enabled
    };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new HasSpecialCharConstraint(mockSettingsService);
  }

  it('should accept each special character from the list', async () => {
    const constraint = createConstraint();
    for (const char of SPECIAL_CHARS) {
      expect(await constraint.validate(`abc${char}`)).toBe(true);
    }
  });

  it('should reject a password without a special character', async () => {
    expect(await createConstraint().validate('abcdef1')).toBe(false);
  });

  it('should reject non-listed special characters', async () => {
    expect(await createConstraint().validate('abcdef1 ')).toBe(false);
    expect(await createConstraint().validate('abcdef1\u00e9')).toBe(false);
  });

  it('should accept any password when disabled', async () => {
    expect(await createConstraint(false).validate('abcdef1')).toBe(true);
  });

  it('should reject non-string values', async () => {
    expect(await createConstraint().validate(undefined)).toBe(false);
  });
});
