import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { TenantSetting } from '../../../config/settings';
import { SettingsService } from '../../../service/settings.service';

export const SPECIAL_CHARS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

@Injectable()
@ValidatorConstraint({ name: 'hasSpecialChar', async: true })
export class HasSpecialCharConstraint implements ValidatorConstraintInterface {
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordRequireSpecialChar, '');
    if (!enabled) return true;
    return (
      typeof value === 'string' &&
      [...value].some((c) => SPECIAL_CHARS.includes(c))
    );
  }

  defaultMessage(): string {
    return 'Password must contain at least one special character';
  }
}

export function HasSpecialChar(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: HasSpecialCharConstraint
    });
  };
}
