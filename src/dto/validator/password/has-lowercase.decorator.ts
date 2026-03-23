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
@ValidatorConstraint({ name: 'hasLowercase' })
export class HasLowercaseConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(
    @Inject(TENANT_CONFIG) tenantConfig: AuthoraTenantConfig
  ) {
    this._enabled = tenantConfig.passwordRequireLowercase;
  }

  validate(value: unknown): boolean {
    if (!this._enabled) return true;
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
