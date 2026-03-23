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
@ValidatorConstraint({ name: 'hasUppercase' })
export class HasUppercaseConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(
    @Inject(TENANT_CONFIG) tenantConfig: AuthoraTenantConfig
  ) {
    this._enabled = tenantConfig.passwordRequireUppercase;
  }

  validate(value: unknown): boolean {
    if (!this._enabled) return true;
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
