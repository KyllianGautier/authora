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
@ValidatorConstraint({ name: 'hasUppercase', async: true })
export class HasUppercaseConstraint implements ValidatorConstraintInterface {
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordRequireUppercase, '');
    if (!enabled) return true;
    return typeof value === 'string' && /[A-Z]/.test(value);
  }

  defaultMessage(): string {
    return 'Password must contain at least one uppercase letter';
  }
}

export function HasUppercase(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: HasUppercaseConstraint
    });
  };
}
