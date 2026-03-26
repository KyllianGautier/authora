import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { TenantSetting } from '../../../config/settings';
import { SettingsService } from '../../../service/settings.service';

const SEQUENCE_MIN_LENGTH = 4;

@Injectable()
@ValidatorConstraint({ name: 'noSequentialChars', async: true })
export class NoSequentialCharsConstraint
  implements ValidatorConstraintInterface
{
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordForbidSequentialChars, '');
    if (!enabled) return true;
    if (typeof value !== 'string') return true;

    const lower = value.toLowerCase();
    let run = 1;
    let dir = 0;

    for (let i = 1; i < lower.length; i++) {
      const prev = lower.charCodeAt(i - 1);
      const curr = lower.charCodeAt(i);
      const diff = curr - prev;

      const bothLetters =
        lower[i - 1] >= 'a' &&
        lower[i - 1] <= 'z' &&
        lower[i] >= 'a' &&
        lower[i] <= 'z';
      const bothDigits =
        lower[i - 1] >= '0' &&
        lower[i - 1] <= '9' &&
        lower[i] >= '0' &&
        lower[i] <= '9';

      if ((bothLetters || bothDigits) && (diff === 1 || diff === -1)) {
        if (dir === 0 || dir === diff) {
          dir = diff;
          run++;
          if (run >= SEQUENCE_MIN_LENGTH) return false;
        } else {
          dir = diff;
          run = 2;
        }
      } else {
        run = 1;
        dir = 0;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'Password must not contain sequential characters';
  }
}

export function NoSequentialChars(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: NoSequentialCharsConstraint
    });
  };
}
