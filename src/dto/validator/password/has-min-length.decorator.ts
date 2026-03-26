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
@ValidatorConstraint({ name: 'hasMinLength', async: true })
export class HasMinLengthConstraint implements ValidatorConstraintInterface {
  private _lastMinLength = 8;

  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    this._lastMinLength = await this._settingsService.get(TenantSetting.PasswordMinLength, '');
    return typeof value === 'string' && value.length >= this._lastMinLength;
  }

  defaultMessage(): string {
    return `Password must contain at least ${this._lastMinLength} characters`;
  }
}

export function HasMinLength(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: HasMinLengthConstraint
    });
  };
}
