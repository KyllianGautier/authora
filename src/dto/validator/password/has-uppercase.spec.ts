import { ConfigService } from '@nestjs/config';
import { HasUppercaseConstraint } from './has-uppercase.decorator';

describe('HasUppercaseConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      getOrThrow: jest.fn(() => enabled)
    } as unknown as ConfigService;
    return new HasUppercaseConstraint(config);
  }

  it('should accept a password with an uppercase letter', () => {
    expect(createConstraint().validate('abcA')).toBe(true);
  });

  it('should reject a password without an uppercase letter', () => {
    expect(createConstraint().validate('abc123!')).toBe(false);
  });

  it('should accept any password when disabled', () => {
    expect(createConstraint(false).validate('abc123!')).toBe(true);
  });

  it('should reject non-string values', () => {
    expect(createConstraint().validate(undefined)).toBe(false);
  });
});
