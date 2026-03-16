import { ConfigService } from '@nestjs/config';
import {
  HasSpecialCharConstraint,
  SPECIAL_CHARS
} from './has-special-char.decorator';

describe('HasSpecialCharConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      getOrThrow: jest.fn(() => enabled)
    } as unknown as ConfigService;
    return new HasSpecialCharConstraint(config);
  }

  it('should accept each special character from the list', () => {
    const constraint = createConstraint();
    for (const char of SPECIAL_CHARS) {
      expect(constraint.validate(`abc${char}`)).toBe(true);
    }
  });

  it('should reject a password without a special character', () => {
    expect(createConstraint().validate('abcdef1')).toBe(false);
  });

  it('should reject non-listed special characters', () => {
    expect(createConstraint().validate('abcdef1 ')).toBe(false);
    expect(createConstraint().validate('abcdef1\u00e9')).toBe(false);
  });

  it('should accept any password when disabled', () => {
    expect(createConstraint(false).validate('abcdef1')).toBe(true);
  });

  it('should reject non-string values', () => {
    expect(createConstraint().validate(undefined)).toBe(false);
  });
});
