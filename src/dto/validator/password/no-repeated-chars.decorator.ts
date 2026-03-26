import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { TenantSetting } from '../../../config/settings';
import { SettingsService } from '../../../service/settings.service';

const REPEAT_MIN_LENGTH = 3;

@Injectable()
@ValidatorConstraint({ name: 'noRepeatedChars', async: true })
export class NoRepeatedCharsConstraint
  implements ValidatorConstraintInterface
{
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordForbidRepeatedChars, '');
    if (!enabled) return true;
    if (typeof value !== 'string') return true;

    const lower = value.toLowerCase();
    let run = 1;

    for (let i = 1; i < lower.length; i++) {
      if (lower[i] === lower[i - 1]) {
        run++;
        if (run >= REPEAT_MIN_LENGTH) return false;
      } else {
        run = 1;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'Password must not contain repeated characters';
  }
}

export function NoRepeatedChars(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: NoRepeatedCharsConstraint
    });
  };
}
