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
@ValidatorConstraint({ name: 'hasMinLength' })
export class HasMinLengthConstraint implements ValidatorConstraintInterface {
  private readonly _minLength: number;

  constructor(
    @Inject(TENANT_CONFIG) tenantConfig: AuthoraTenantConfig
  ) {
    this._minLength = tenantConfig.passwordMinLength;
  }

  validate(value: unknown): boolean {
    return typeof value === 'string' && value.length >= this._minLength;
  }

  defaultMessage(): string {
    return `Password must contain at least ${this._minLength} characters`;
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
