import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { TenantSetting } from '../../../config/settings';
import { SettingsService } from '../../../service/settings.service';

const KEYBOARD_SEQUENCE_MIN_LENGTH = 4;

export const KEYBOARD_ROWS = [
  // Shared
  '1234567890',

  // QWERTY (EN/ES)
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',

  // AZERTY (FR)
  'azertyuiop',
  'qsdfghjklm',
  'wxcvbn',

  // QWERTZ (DE)
  'qwertzuiop',
  'asdfghjkl',
  'yxcvbnm'
].filter((row, index, self) => self.indexOf(row) === index);

@Injectable()
@ValidatorConstraint({ name: 'noKeyboardSequence', async: true })
export class NoKeyboardSequenceConstraint
  implements ValidatorConstraintInterface
{
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordForbidKeyboardSequence, '');
    if (!enabled) return true;
    if (typeof value !== 'string') return true;

    const lower = value.toLowerCase();

    for (const row of KEYBOARD_ROWS) {
      const reversed = [...row].reverse().join('');

      for (const seq of [row, reversed]) {
        for (
          let i = 0;
          i <= lower.length - KEYBOARD_SEQUENCE_MIN_LENGTH;
          i++
        ) {
          const substr = lower.substring(
            i,
            i + KEYBOARD_SEQUENCE_MIN_LENGTH
          );
          if (seq.includes(substr)) return false;
        }
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'Password must not contain keyboard sequences';
  }
}

export function NoKeyboardSequence(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: NoKeyboardSequenceConstraint
    });
  };
}
