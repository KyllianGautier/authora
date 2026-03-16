import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

@Injectable()
@ValidatorConstraint({ name: 'hasDigit' })
export class HasDigitConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(config: ConfigService) {
    this._enabled = config.getOrThrow<boolean>('PASSWORD_REQUIRE_DIGIT');
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
