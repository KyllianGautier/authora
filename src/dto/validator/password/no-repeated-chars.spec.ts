import { defaultTenantConfig } from '../../../config/tenant-config';
import { NoRepeatedCharsConstraint } from './no-repeated-chars.decorator';

describe('NoRepeatedCharsConstraint', () => {
  function createConstraint(enabled = true) {
    return new NoRepeatedCharsConstraint({
      ...defaultTenantConfig,
      passwordForbidRepeatedChars: enabled
    });
  }

  it('should reject 3+ identical characters', () => {
    const constraint = createConstraint();
    expect(constraint.validate('Xaaa55X!')).toBe(false);
    expect(constraint.validate('X111abX!')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(createConstraint().validate('XaAa55X!')).toBe(false);
  });

  it('should accept 2 identical characters (below threshold)', () => {
    expect(createConstraint().validate('Xaa5x5X!')).toBe(true);
  });

  it('should accept any password when disabled', () => {
    expect(createConstraint(false).validate('Xaaa55X!')).toBe(true);
  });
});
