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
@ValidatorConstraint({ name: 'hasLowercase', async: true })
export class HasLowercaseConstraint implements ValidatorConstraintInterface {
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordRequireLowercase, '');
    if (!enabled) return true;
    return typeof value === 'string' && /[a-z]/.test(value);
  }

  defaultMessage(): string {
    return 'Password must contain at least one lowercase letter';
  }
}

export function HasLowercase(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: HasLowercaseConstraint
    });
  };
}
