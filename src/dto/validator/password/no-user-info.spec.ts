import { ValidationArguments } from 'class-validator';
import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { NoUserInfoConstraint } from './no-user-info.decorator';

describe('NoUserInfoConstraint', () => {
  function createConstraint(enabled = true) {
    const config = { ...defaultTenantConfig, passwordForbidUserInfo: enabled };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new NoUserInfoConstraint(mockSettingsService);
  }

  function argsWithEmail(email: string): ValidationArguments {
    return {
      object: { email },
      constraints: ['email']
    } as unknown as ValidationArguments;
  }

  it('should reject passwords containing the email local part', async () => {
    const constraint = createConstraint();
    const args = argsWithEmail('john.doe@example.com');
    expect(await constraint.validate('Xjohn5X!', args)).toBe(false);
    expect(await constraint.validate('Xdoe55X!', args)).toBe(false);
    expect(await constraint.validate('XaDoe5X!', args)).toBe(false);
  });

  it('should reject passwords containing the domain name', async () => {
    const constraint = createConstraint();
    const args = argsWithEmail('user@company.com');
    expect(await constraint.validate('Xcompany1!', args)).toBe(false);
  });

  it('should ignore the TLD', async () => {
    const constraint = createConstraint();
    const args = argsWithEmail('user@example.com');
    expect(await constraint.validate('Xxxcom5X!', args)).toBe(true);
  });

  it('should split local part by separators', async () => {
    const constraint = createConstraint();

    const argsPlus = argsWithEmail('john+test@example.com');
    expect(await constraint.validate('Xjohn5X!', argsPlus)).toBe(false);
    expect(await constraint.validate('Xtest5X!', argsPlus)).toBe(false);

    const argsUnderscore = argsWithEmail('john_test@example.com');
    expect(await constraint.validate('Xjohn5X!', argsUnderscore)).toBe(false);

    const argsDash = argsWithEmail('john-test@example.com');
    expect(await constraint.validate('Xjohn5X!', argsDash)).toBe(false);
  });

  it('should be case-insensitive', async () => {
    const constraint = createConstraint();
    const args = argsWithEmail('John@Example.com');
    expect(await constraint.validate('Xjohn5X!', args)).toBe(false);
    expect(await constraint.validate('XJOHN5X!', args)).toBe(false);
  });

  it('should ignore parts shorter than 3 characters', async () => {
    const constraint = createConstraint();
    const args = argsWithEmail('ab@cd.com');
    expect(await constraint.validate('Xab555X!', args)).toBe(true);
  });

  it('should handle subdomain in domain', async () => {
    const constraint = createConstraint();
    const args = argsWithEmail('user@mail.company.com');
    expect(await constraint.validate('Xmail5company1!', args)).toBe(false);
  });

  it('should skip the check when no email is available', async () => {
    expect(await createConstraint().validate('Xjohn5X!')).toBe(true);
  });

  it('should accept any password when disabled', async () => {
    const constraint = createConstraint(false);
    const args = argsWithEmail('john@example.com');
    expect(await constraint.validate('Xjohn5X!', args)).toBe(true);
  });
});
