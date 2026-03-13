import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildBreachedPasswordRequest } from '../../config/breached-password.client';
import {
  registerDecorator,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationOptions
} from 'class-validator';

export const SPECIAL_CHARS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

const SEQUENCE_MIN_LENGTH = 4;
const REPEAT_MIN_LENGTH = 3;
const KEYBOARD_SEQUENCE_MIN_LENGTH = 4;
const USER_INFO_MIN_LENGTH = 3;

export const KEYBOARD_ROWS = [
  '1234567890',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'azertyuiop',
  'qsdfghjklm',
  'wxcvbn'
];

@Injectable()
@ValidatorConstraint({ name: 'isStrongPassword', async: true })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  private readonly minLength: number;
  private readonly requireDigit: boolean;
  private readonly requireSpecialChar: boolean;
  private readonly requireLowercase: boolean;
  private readonly requireUppercase: boolean;
  private readonly forbidSequence: boolean;
  private readonly forbidRepeatedChars: boolean;
  private readonly forbidKeyboardSequence: boolean;
  private readonly forbidUserInfo: boolean;
  private readonly forbidCommonPassword: boolean;

  constructor(config: ConfigService) {
    this.minLength = config.getOrThrow<number>('PASSWORD_MIN_LENGTH');
    this.requireDigit = config.getOrThrow<boolean>('PASSWORD_REQUIRE_DIGIT');
    this.requireSpecialChar = config.getOrThrow<boolean>(
      'PASSWORD_REQUIRE_SPECIAL_CHAR'
    );
    this.requireLowercase = config.getOrThrow<boolean>(
      'PASSWORD_REQUIRE_LOWERCASE'
    );
    this.requireUppercase = config.getOrThrow<boolean>(
      'PASSWORD_REQUIRE_UPPERCASE'
    );
    this.forbidSequence = config.getOrThrow<boolean>(
      'PASSWORD_FORBID_SEQUENTIAL_CHARS'
    );
    this.forbidRepeatedChars = config.getOrThrow<boolean>(
      'PASSWORD_FORBID_REPEATED_CHARS'
    );
    this.forbidKeyboardSequence = config.getOrThrow<boolean>(
      'PASSWORD_FORBID_KEYBOARD_SEQUENCE'
    );
    this.forbidUserInfo = config.getOrThrow<boolean>(
      'PASSWORD_FORBID_USER_INFO'
    );
    this.forbidCommonPassword = config.getOrThrow<boolean>(
      'PASSWORD_FORBID_COMMON_PASSWORD'
    );
  }

  async validate(value: unknown, args?: ValidationArguments): Promise<boolean> {
    if (typeof value !== 'string') return false;

    if (value.length < this.minLength) return false;
    if (this.requireDigit && !/\d/.test(value)) return false;
    if (this.requireSpecialChar && ![...value].some((c) => SPECIAL_CHARS.includes(c))) return false;
    if (this.requireLowercase && !/[a-z]/.test(value)) return false;
    if (this.requireUppercase && !/[A-Z]/.test(value)) return false;
    if (this.forbidSequence && this._hasSequence(value)) return false;
    if (this.forbidRepeatedChars && this._hasRepeatedChars(value)) return false;
    if (this.forbidKeyboardSequence && this._hasKeyboardSequence(value)) return false;

    if (this.forbidUserInfo) {
      const emailField = args?.constraints?.[0] as string | undefined;
      const email = emailField
        ? (args?.object as Record<string, unknown>)?.[emailField]
        : undefined;
      if (typeof email === 'string' && this._hasUserInfo(value, email)) return false;
    }

    if (this.forbidCommonPassword && await this._isBreachedPassword(value)) return false;

    return true;
  }

  defaultMessage(): string {
    const requirements: string[] = [`at least ${this.minLength} characters`];
    if (this.requireDigit) requirements.push('one digit');
    if (this.requireSpecialChar) requirements.push('one special character');
    if (this.requireLowercase) requirements.push('one lowercase letter');
    if (this.requireUppercase) requirements.push('one uppercase letter');

    const restrictions: string[] = [];
    if (this.forbidSequence) restrictions.push('sequential characters');
    if (this.forbidRepeatedChars) restrictions.push('repeated characters');
    if (this.forbidKeyboardSequence) restrictions.push('keyboard sequences');
    if (this.forbidUserInfo) restrictions.push('user info');
    if (this.forbidCommonPassword) restrictions.push('common passwords');

    let message = `Password must contain ${requirements.join(', ')}`;
    if (restrictions.length > 0) {
      message += ` and must not contain ${restrictions.join(', ')}`;
    }
    return message;
  }

  /**
   * Detects ascending or descending runs of consecutive character codes
   * within the same range (letters or digits). e.g. 'abcd', '4321'
   */
  private _hasSequence(value: string): boolean {
    const lower = value.toLowerCase();
    let run = 1;
    let dir = 0;

    for (let i = 1; i < lower.length; i++) {
      const prev = lower.charCodeAt(i - 1);
      const curr = lower.charCodeAt(i);
      const diff = curr - prev;

      const bothLetters = lower[i - 1] >= 'a' && lower[i - 1] <= 'z'
        && lower[i] >= 'a' && lower[i] <= 'z';
      const bothDigits = lower[i - 1] >= '0' && lower[i - 1] <= '9'
        && lower[i] >= '0' && lower[i] <= '9';

      if ((bothLetters || bothDigits) && (diff === 1 || diff === -1)) {
        if (dir === 0 || dir === diff) {
          dir = diff;
          run++;
          if (run >= SEQUENCE_MIN_LENGTH) return true;
        } else {
          dir = diff;
          run = 2;
        }
      } else {
        run = 1;
        dir = 0;
      }
    }

    return false;
  }

  /**
   * Detects runs of identical characters (case-insensitive). e.g. 'aaa', 'ZZZ'
   */
  private _hasRepeatedChars(value: string): boolean {
    const lower = value.toLowerCase();
    let run = 1;

    for (let i = 1; i < lower.length; i++) {
      if (lower[i] === lower[i - 1]) {
        run++;
        if (run >= REPEAT_MIN_LENGTH) return true;
      } else {
        run = 1;
      }
    }

    return false;
  }

  /**
   * Detects substrings that match consecutive keys on QWERTY or AZERTY
   * keyboard rows (forward or reversed). e.g. 'qwer', 'uiop', 'qsdf'
   */
  private _hasKeyboardSequence(value: string): boolean {
    const lower = value.toLowerCase();

    for (const row of KEYBOARD_ROWS) {
      const reversed = [...row].reverse().join('');

      for (const seq of [row, reversed]) {
        for (let i = 0; i <= lower.length - KEYBOARD_SEQUENCE_MIN_LENGTH; i++) {
          const substr = lower.substring(i, i + KEYBOARD_SEQUENCE_MIN_LENGTH);
          if (seq.includes(substr)) return true;
        }
      }
    }

    return false;
  }

  /**
   * Detects parts of the user's email in the password.
   * Splits the local part by common separators and checks the domain
   * name (without TLD). Only parts with 3+ characters are checked.
   */
  private _hasUserInfo(value: string, email: string): boolean {
    const lower = value.toLowerCase();
    const atIndex = email.indexOf('@');
    if (atIndex === -1) return false;

    const localPart = email.substring(0, atIndex).toLowerCase();
    const domain = email.substring(atIndex + 1).toLowerCase();

    const parts = localPart.split(/[.\-_+]/);

    const domainParts = domain.split('.');
    if (domainParts.length > 1) {
      domainParts.pop();
      parts.push(...domainParts);
    }

    for (const part of parts) {
      if (part.length >= USER_INFO_MIN_LENGTH && lower.includes(part)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks the password against a breached passwords API.
   * If the API is unreachable, the check is skipped (fail-open).
   */
  private async _isBreachedPassword(value: string): Promise<boolean> {
    const { url, valueToMatch } = buildBreachedPasswordRequest(value);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) return false;

      const body = await response.text();
      return body.split('\n').some((line) => line.startsWith(valueToMatch));
    } catch {
      return false;
    }
  }
}

export interface StrongPasswordOptions extends ValidationOptions {
  emailField?: string;
}

export function IsStrongPassword(options?: StrongPasswordOptions) {
  const { emailField, ...validationOptions } = options ?? {};
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: emailField ? [emailField] : [],
      validator: IsStrongPasswordConstraint
    });
  };
}
