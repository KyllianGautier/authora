import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { TenantSetting } from '../../../config/settings';
import { SettingsService } from '../../../service/settings.service';

@Injectable()
@ValidatorConstraint({ name: 'hasDigit', async: true })
export class HasDigitConstraint implements ValidatorConstraintInterface {
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordRequireDigit, '');
    if (!enabled) return true;
    return typeof value === 'string' && /\d/.test(value);
  }

  defaultMessage(): string {
    return 'Password must contain at least one digit';
  }
}

export function HasDigit(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: HasDigitConstraint
    });
  };
}
