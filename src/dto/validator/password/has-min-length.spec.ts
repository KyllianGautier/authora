import { defaultTenantConfig } from '../../../config/tenant-config';
import { HasMinLengthConstraint } from './has-min-length.decorator';

describe('HasMinLengthConstraint', () => {
  function createConstraint(minLength = 8) {
    return new HasMinLengthConstraint({
      ...defaultTenantConfig,
      passwordMinLength: minLength
    });
  }

  it('should accept a password meeting the minimum length', () => {
    const constraint = createConstraint(8);
    expect(constraint.validate('12345678')).toBe(true);
  });

  it('should reject a password shorter than the minimum length', () => {
    const constraint = createConstraint(8);
    expect(constraint.validate('1234567')).toBe(false);
  });

  it('should respect a custom minimum length', () => {
    const constraint = createConstraint(12);
    expect(constraint.validate('12345678')).toBe(false);
    expect(constraint.validate('123456789012')).toBe(true);
  });

  it('should reject non-string values', () => {
    const constraint = createConstraint();
    expect(constraint.validate(undefined)).toBe(false);
    expect(constraint.validate(null)).toBe(false);
    expect(constraint.validate(123)).toBe(false);
  });

  it('should include the configured length in the default message', () => {
    const constraint = createConstraint(12);
    expect(constraint.defaultMessage()).toBe(
      'Password must contain at least 12 characters'
    );
  });
});
