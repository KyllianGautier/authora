import { defaultTenantConfig } from '../../../config/tenant-config';
import { HasLowercaseConstraint } from './has-lowercase.decorator';

describe('HasLowercaseConstraint', () => {
  function createConstraint(enabled = true) {
    return new HasLowercaseConstraint({
      ...defaultTenantConfig,
      passwordRequireLowercase: enabled
    });
  }

  it('should accept a password with a lowercase letter', () => {
    expect(createConstraint().validate('ABCa')).toBe(true);
  });

  it('should reject a password without a lowercase letter', () => {
    expect(createConstraint().validate('ABC123!')).toBe(false);
  });

  it('should accept any password when disabled', () => {
    expect(createConstraint(false).validate('ABC123!')).toBe(true);
  });

  it('should reject non-string values', () => {
    expect(createConstraint().validate(undefined)).toBe(false);
  });
});
