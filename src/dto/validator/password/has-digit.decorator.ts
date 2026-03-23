import { Inject, Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import type { AuthoraTenantConfig } from '../../../config/tenant-config';
import { TENANT_CONFIG } from '../../../config/tenant-config';

@Injectable()
@ValidatorConstraint({ name: 'hasDigit' })
export class HasDigitConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(
    @Inject(TENANT_CONFIG) tenantConfig: AuthoraTenantConfig
  ) {
    this._enabled = tenantConfig.passwordRequireDigit;
  }

  validate(value: unknown): boolean {
    if (!this._enabled) return true;
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
