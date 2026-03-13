import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ValidationArguments } from 'class-validator';
import { IsStrongPasswordConstraint, SPECIAL_CHARS } from './is-strong-password.decorator';

describe('IsStrongPasswordConstraint', () => {
  function createConstraint(overrides: Record<string, unknown> = {}) {
    const defaults: Record<string, unknown> = {
      PASSWORD_MIN_LENGTH: 8,
      PASSWORD_REQUIRE_DIGIT: true,
      PASSWORD_REQUIRE_SPECIAL_CHAR: true,
      PASSWORD_REQUIRE_LOWERCASE: true,
      PASSWORD_REQUIRE_UPPERCASE: true,
      PASSWORD_FORBID_SEQUENTIAL_CHARS: false,
      PASSWORD_FORBID_REPEATED_CHARS: false,
      PASSWORD_FORBID_KEYBOARD_SEQUENCE: false,
      PASSWORD_FORBID_USER_INFO: false,
      PASSWORD_FORBID_COMMON_PASSWORD: false
    };
    const values = { ...defaults, ...overrides };

    const configService = {
      getOrThrow: jest.fn((key: string) => values[key])
    } as unknown as ConfigService;

    return new IsStrongPasswordConstraint(configService);
  }

  function argsWithEmail(email: string): ValidationArguments {
    return {
      object: { email },
      constraints: ['email']
    } as unknown as ValidationArguments;
  }

  describe('validate', () => {
    it('should accept a valid password with all rules enabled', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Abcdef1!')).toBe(true);
    });

    it('should reject non-string values', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate(undefined)).toBe(false);
      expect(await constraint.validate(null)).toBe(false);
      expect(await constraint.validate(123)).toBe(false);
    });

    it('should reject passwords shorter than minLength', async () => {
      const constraint = createConstraint({ PASSWORD_MIN_LENGTH: 10 });
      expect(await constraint.validate('Abcdef1!')).toBe(false);
      expect(await constraint.validate('Abcdefgh1!')).toBe(true);
    });

    it('should reject passwords without a digit when required', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Abcdefgh!')).toBe(false);
    });

    it('should accept passwords without a digit when not required', async () => {
      const constraint = createConstraint({ PASSWORD_REQUIRE_DIGIT: false });
      expect(await constraint.validate('Abcdefgh!')).toBe(true);
    });

    it('should reject passwords without a special character when required', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Abcdefg1')).toBe(false);
    });

    it('should accept passwords without a special character when not required', async () => {
      const constraint = createConstraint({ PASSWORD_REQUIRE_SPECIAL_CHAR: false });
      expect(await constraint.validate('Abcdefg1')).toBe(true);
    });

    it('should reject passwords without a lowercase letter when required', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('ABCDEFG1!')).toBe(false);
    });

    it('should accept passwords without a lowercase letter when not required', async () => {
      const constraint = createConstraint({ PASSWORD_REQUIRE_LOWERCASE: false });
      expect(await constraint.validate('ABCDEFG1!')).toBe(true);
    });

    it('should reject passwords without an uppercase letter when required', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('abcdefg1!')).toBe(false);
    });

    it('should accept passwords without an uppercase letter when not required', async () => {
      const constraint = createConstraint({ PASSWORD_REQUIRE_UPPERCASE: false });
      expect(await constraint.validate('abcdefg1!')).toBe(true);
    });

    it('should accept each special character from the SPECIAL_CHARS list', async () => {
      const constraint = createConstraint();
      for (const char of SPECIAL_CHARS) {
        expect(await constraint.validate(`Abcdefg1${char}`)).toBe(true);
      }
    });

    it('should reject passwords with only non-listed special characters', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Abcdefg1 ')).toBe(false);
      expect(await constraint.validate('Abcdefg1\u00e9')).toBe(false);
    });

    it('should only enforce minLength when all other rules are disabled', async () => {
      const constraint = createConstraint({
        PASSWORD_REQUIRE_DIGIT: false,
        PASSWORD_REQUIRE_SPECIAL_CHAR: false,
        PASSWORD_REQUIRE_LOWERCASE: false,
        PASSWORD_REQUIRE_UPPERCASE: false
      });
      expect(await constraint.validate('abcdefgh')).toBe(true);
      expect(await constraint.validate('short')).toBe(false);
    });
  });

  describe('sequential characters', () => {
    const constraint = createConstraint({ PASSWORD_FORBID_SEQUENTIAL_CHARS: true });

    it('should reject ascending letter sequences of 4+', async () => {
      expect(await constraint.validate('Xabcd5X!')).toBe(false);
      expect(await constraint.validate('Xmnop5X!')).toBe(false);
    });

    it('should reject descending letter sequences of 4+', async () => {
      expect(await constraint.validate('Xdcba5X!')).toBe(false);
    });

    it('should reject ascending digit sequences of 4+', async () => {
      expect(await constraint.validate('Xa1234X!')).toBe(false);
    });

    it('should reject descending digit sequences of 4+', async () => {
      expect(await constraint.validate('Xa9876X!')).toBe(false);
    });

    it('should accept 3 sequential characters (below threshold)', async () => {
      expect(await constraint.validate('Xabc55X!')).toBe(true);
      expect(await constraint.validate('Xa123xX!')).toBe(true);
    });

    it('should be case-insensitive', async () => {
      expect(await constraint.validate('XABCD5x!')).toBe(false);
      expect(await constraint.validate('XaBcD5x!')).toBe(false);
    });

    it('should not detect sequences across letters and digits', async () => {
      expect(await constraint.validate('Xyz012X!')).toBe(true);
    });
  });

  describe('repeated characters', () => {
    const constraint = createConstraint({ PASSWORD_FORBID_REPEATED_CHARS: true });

    it('should reject 3+ identical characters', async () => {
      expect(await constraint.validate('Xaaa55X!')).toBe(false);
      expect(await constraint.validate('X111abX!')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      expect(await constraint.validate('XaAa55X!')).toBe(false);
    });

    it('should accept 2 identical characters (below threshold)', async () => {
      expect(await constraint.validate('Xaa5x5X!')).toBe(true);
    });
  });

  describe('keyboard sequences', () => {
    const constraint = createConstraint({ PASSWORD_FORBID_KEYBOARD_SEQUENCE: true });

    it('should reject QWERTY row sequences', async () => {
      expect(await constraint.validate('Xqwer55!')).toBe(false);
      expect(await constraint.validate('Xuiop55!')).toBe(false);
      expect(await constraint.validate('Xasdf55!')).toBe(false);
      expect(await constraint.validate('Xzxcv55!')).toBe(false);
    });

    it('should reject AZERTY row sequences', async () => {
      expect(await constraint.validate('Xazer55!')).toBe(false);
      expect(await constraint.validate('Xqsdf55!')).toBe(false);
      expect(await constraint.validate('Xwxcv55!')).toBe(false);
    });

    it('should reject reversed keyboard sequences', async () => {
      expect(await constraint.validate('Xrewq55!')).toBe(false);
      expect(await constraint.validate('Xpoiu55!')).toBe(false);
    });

    it('should reject number row sequences', async () => {
      expect(await constraint.validate('X1234aX!')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      expect(await constraint.validate('XQWER55!')).toBe(false);
    });

    it('should accept 3 keyboard-adjacent characters (below threshold)', async () => {
      expect(await constraint.validate('Xqwe555!')).toBe(true);
    });
  });

  describe('user info', () => {
    const constraint = createConstraint({ PASSWORD_FORBID_USER_INFO: true });

    it('should reject passwords containing the email local part', async () => {
      const args = argsWithEmail('john.doe@example.com');
      expect(await constraint.validate('Xjohn5X!', args)).toBe(false);
      expect(await constraint.validate('Xdoe55X!', args)).toBe(false);
      expect(await constraint.validate('XaDoe5X!', args)).toBe(false);
    });

    it('should reject passwords containing the domain name', async () => {
      const args = argsWithEmail('user@company.com');
      expect(await constraint.validate('Xcompany1!', args)).toBe(false);
    });

    it('should ignore the TLD', async () => {
      const args = argsWithEmail('user@example.com');
      expect(await constraint.validate('Xxxcom5X!', args)).toBe(true);
    });

    it('should split local part by separators', async () => {
      const argsPlus = argsWithEmail('john+test@example.com');
      expect(await constraint.validate('Xjohn5X!', argsPlus)).toBe(false);
      expect(await constraint.validate('Xtest5X!', argsPlus)).toBe(false);

      const argsUnderscore = argsWithEmail('john_test@example.com');
      expect(await constraint.validate('Xjohn5X!', argsUnderscore)).toBe(false);

      const argsDash = argsWithEmail('john-test@example.com');
      expect(await constraint.validate('Xjohn5X!', argsDash)).toBe(false);
    });

    it('should be case-insensitive', async () => {
      const args = argsWithEmail('John@Example.com');
      expect(await constraint.validate('Xjohn5X!', args)).toBe(false);
      expect(await constraint.validate('XJOHN5X!', args)).toBe(false);
    });

    it('should ignore parts shorter than 3 characters', async () => {
      const args = argsWithEmail('ab@cd.com');
      expect(await constraint.validate('Xab555X!', args)).toBe(true);
    });

    it('should handle subdomain in domain', async () => {
      const args = argsWithEmail('user@mail.company.com');
      expect(await constraint.validate('Xmail5company1!', args)).toBe(false);
    });

    it('should skip the check when no email is available', async () => {
      expect(await constraint.validate('Xjohn5X!')).toBe(true);
    });
  });

  describe('common password (Have I Been Pwned)', () => {
    const constraint = createConstraint({ PASSWORD_FORBID_COMMON_PASSWORD: true });

    function pwnedResponseFor(password: string): string {
      const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
      const suffix = sha1.substring(5);
      return [
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3',
        `${suffix}:42`,
        'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:1'
      ].join('\n');
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should reject a breached password', async () => {
      const password = 'Abcdef1!';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => pwnedResponseFor(password)
      } as Response);

      expect(await constraint.validate(password)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should accept a password not found in the breach list', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:1'
      } as Response);

      expect(await constraint.validate('Abcdef1!')).toBe(true);
    });

    it('should pass (fail-open) when the API returns an error', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500
      } as Response);

      expect(await constraint.validate('Abcdef1!')).toBe(true);
    });

    it('should pass (fail-open) when the API is unreachable', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

      expect(await constraint.validate('Abcdef1!')).toBe(true);
    });

    it('should not call the API when the rule is disabled', async () => {
      const disabledConstraint = createConstraint({ PASSWORD_FORBID_COMMON_PASSWORD: false });
      jest.spyOn(global, 'fetch');

      expect(await disabledConstraint.validate('Abcdef1!')).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('rule independence', () => {
    it('should accept sequential chars when only that rule is disabled', async () => {
      const constraint = createConstraint({
        PASSWORD_FORBID_SEQUENTIAL_CHARS: false,
        PASSWORD_FORBID_REPEATED_CHARS: true,
        PASSWORD_FORBID_KEYBOARD_SEQUENCE: true
      });
      expect(await constraint.validate('Xamnop5X!')).toBe(true);
    });

    it('should accept repeated chars when only that rule is disabled', async () => {
      const constraint = createConstraint({
        PASSWORD_FORBID_SEQUENTIAL_CHARS: true,
        PASSWORD_FORBID_REPEATED_CHARS: false,
        PASSWORD_FORBID_KEYBOARD_SEQUENCE: true
      });
      expect(await constraint.validate('Xaaax5X!')).toBe(true);
    });

    it('should accept keyboard sequences when only that rule is disabled', async () => {
      const constraint = createConstraint({
        PASSWORD_FORBID_SEQUENTIAL_CHARS: true,
        PASSWORD_FORBID_REPEATED_CHARS: true,
        PASSWORD_FORBID_KEYBOARD_SEQUENCE: false
      });
      expect(await constraint.validate('Xqwer5X!')).toBe(true);
    });

    it('should accept user info when only that rule is disabled', async () => {
      const constraint = createConstraint({
        PASSWORD_FORBID_USER_INFO: false,
        PASSWORD_FORBID_SEQUENTIAL_CHARS: true
      });
      const args = argsWithEmail('john@example.com');
      expect(await constraint.validate('Xjohn5X!', args)).toBe(true);
    });
  });

  describe('defaultMessage', () => {
    it('should list all rules when all are enabled', () => {
      const constraint = createConstraint();
      const message = constraint.defaultMessage();
      expect(message).toContain('at least 8 characters');
      expect(message).toContain('one digit');
      expect(message).toContain('one special character');
      expect(message).toContain('one lowercase letter');
      expect(message).toContain('one uppercase letter');
    });

    it('should only mention minLength when all other rules are disabled', () => {
      const constraint = createConstraint({
        PASSWORD_REQUIRE_DIGIT: false,
        PASSWORD_REQUIRE_SPECIAL_CHAR: false,
        PASSWORD_REQUIRE_LOWERCASE: false,
        PASSWORD_REQUIRE_UPPERCASE: false
      });
      const message = constraint.defaultMessage();
      expect(message).toBe('Password must contain at least 8 characters');
    });

    it('should reflect the configured minLength', () => {
      const constraint = createConstraint({ PASSWORD_MIN_LENGTH: 12 });
      expect(constraint.defaultMessage()).toContain('at least 12 characters');
    });

    it('should include restriction rules when enabled', () => {
      const constraint = createConstraint({
        PASSWORD_FORBID_SEQUENTIAL_CHARS: true,
        PASSWORD_FORBID_REPEATED_CHARS: true,
        PASSWORD_FORBID_KEYBOARD_SEQUENCE: true,
        PASSWORD_FORBID_USER_INFO: true,
        PASSWORD_FORBID_COMMON_PASSWORD: true
      });
      const message = constraint.defaultMessage();
      expect(message).toContain('must not contain');
      expect(message).toContain('sequential characters');
      expect(message).toContain('repeated characters');
      expect(message).toContain('keyboard sequences');
      expect(message).toContain('user info');
      expect(message).toContain('common passwords');
    });

    it('should not include "must not contain" when no restrictions are enabled', () => {
      const constraint = createConstraint();
      expect(constraint.defaultMessage()).not.toContain('must not contain');
    });
  });
});
