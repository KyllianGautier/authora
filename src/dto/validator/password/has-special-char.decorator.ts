import { Inject, Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import type { AuthoraTenantConfig } from '../../../config/tenant-config';
import { TENANT_CONFIG } from '../../../config/tenant-config';

export const SPECIAL_CHARS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

@Injectable()
@ValidatorConstraint({ name: 'hasSpecialChar' })
export class HasSpecialCharConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(
    @Inject(TENANT_CONFIG) tenantConfig: AuthoraTenantConfig
  ) {
    this._enabled = tenantConfig.passwordRequireSpecialChar;
  }

  validate(value: unknown): boolean {
    if (!this._enabled) return true;
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
