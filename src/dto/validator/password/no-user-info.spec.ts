import { ConfigService } from '@nestjs/config';
import { ValidationArguments } from 'class-validator';
import { NoUserInfoConstraint } from './no-user-info.decorator';

describe('NoUserInfoConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      getOrThrow: jest.fn(() => enabled)
    } as unknown as ConfigService;
    return new NoUserInfoConstraint(config);
  }

  function argsWithEmail(email: string): ValidationArguments {
    return {
      object: { email },
      constraints: ['email']
    } as unknown as ValidationArguments;
  }

  it('should reject passwords containing the email local part', () => {
    const constraint = createConstraint();
    const args = argsWithEmail('john.doe@example.com');
    expect(constraint.validate('Xjohn5X!', args)).toBe(false);
    expect(constraint.validate('Xdoe55X!', args)).toBe(false);
    expect(constraint.validate('XaDoe5X!', args)).toBe(false);
  });

  it('should reject passwords containing the domain name', () => {
    const constraint = createConstraint();
    const args = argsWithEmail('user@company.com');
    expect(constraint.validate('Xcompany1!', args)).toBe(false);
  });

  it('should ignore the TLD', () => {
    const constraint = createConstraint();
    const args = argsWithEmail('user@example.com');
    expect(constraint.validate('Xxxcom5X!', args)).toBe(true);
  });

  it('should split local part by separators', () => {
    const constraint = createConstraint();

    const argsPlus = argsWithEmail('john+test@example.com');
    expect(constraint.validate('Xjohn5X!', argsPlus)).toBe(false);
    expect(constraint.validate('Xtest5X!', argsPlus)).toBe(false);

    const argsUnderscore = argsWithEmail('john_test@example.com');
    expect(constraint.validate('Xjohn5X!', argsUnderscore)).toBe(false);

    const argsDash = argsWithEmail('john-test@example.com');
    expect(constraint.validate('Xjohn5X!', argsDash)).toBe(false);
  });

  it('should be case-insensitive', () => {
    const constraint = createConstraint();
    const args = argsWithEmail('John@Example.com');
    expect(constraint.validate('Xjohn5X!', args)).toBe(false);
    expect(constraint.validate('XJOHN5X!', args)).toBe(false);
  });

  it('should ignore parts shorter than 3 characters', () => {
    const constraint = createConstraint();
    const args = argsWithEmail('ab@cd.com');
    expect(constraint.validate('Xab555X!', args)).toBe(true);
  });

  it('should handle subdomain in domain', () => {
    const constraint = createConstraint();
    const args = argsWithEmail('user@mail.company.com');
    expect(constraint.validate('Xmail5company1!', args)).toBe(false);
  });

  it('should skip the check when no email is available', () => {
    expect(createConstraint().validate('Xjohn5X!')).toBe(true);
  });

  it('should accept any password when disabled', () => {
    const constraint = createConstraint(false);
    const args = argsWithEmail('john@example.com');
    expect(constraint.validate('Xjohn5X!', args)).toBe(true);
  });
});
