import { defaultTenantConfig } from '../../../config/tenant-config';
import { NoSequentialCharsConstraint } from './no-sequential-chars.decorator';

describe('NoSequentialCharsConstraint', () => {
  function createConstraint(enabled = true) {
    return new NoSequentialCharsConstraint({
      ...defaultTenantConfig,
      passwordForbidSequentialChars: enabled
    });
  }

  it('should reject ascending letter sequences of 4+', () => {
    const constraint = createConstraint();
    expect(constraint.validate('Xabcd5X!')).toBe(false);
    expect(constraint.validate('Xmnop5X!')).toBe(false);
  });

  it('should reject descending letter sequences of 4+', () => {
    expect(createConstraint().validate('Xdcba5X!')).toBe(false);
  });

  it('should reject ascending digit sequences of 4+', () => {
    expect(createConstraint().validate('Xa1234X!')).toBe(false);
  });

  it('should reject descending digit sequences of 4+', () => {
    expect(createConstraint().validate('Xa9876X!')).toBe(false);
  });

  it('should accept 3 sequential characters (below threshold)', () => {
    const constraint = createConstraint();
    expect(constraint.validate('Xabc55X!')).toBe(true);
    expect(constraint.validate('Xa123xX!')).toBe(true);
  });

  it('should be case-insensitive', () => {
    const constraint = createConstraint();
    expect(constraint.validate('XABCD5x!')).toBe(false);
    expect(constraint.validate('XaBcD5x!')).toBe(false);
  });

  it('should not detect sequences across letters and digits', () => {
    expect(createConstraint().validate('Xyz012X!')).toBe(true);
  });

  it('should accept any password when disabled', () => {
    expect(createConstraint(false).validate('Xabcd5X!')).toBe(true);
  });
});
