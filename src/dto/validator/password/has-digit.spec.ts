import { ConfigService } from '@nestjs/config';
import { HasDigitConstraint } from './has-digit.decorator';

describe('HasDigitConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      getOrThrow: jest.fn(() => enabled)
    } as unknown as ConfigService;
    return new HasDigitConstraint(config);
  }

  it('should accept a password with a digit', () => {
    expect(createConstraint().validate('abc1')).toBe(true);
  });

  it('should reject a password without a digit', () => {
    expect(createConstraint().validate('abcdef')).toBe(false);
  });

  it('should accept any password when disabled', () => {
    expect(createConstraint(false).validate('abcdef')).toBe(true);
  });

  it('should reject non-string values', () => {
    expect(createConstraint().validate(undefined)).toBe(false);
  });
});
