import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

@Injectable()
@ValidatorConstraint({ name: 'hasLowercase' })
export class HasLowercaseConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(config: ConfigService) {
    this._enabled = config.getOrThrow<boolean>('PASSWORD_REQUIRE_LOWERCASE');
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
