import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

export const SPECIAL_CHARS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

@Injectable()
@ValidatorConstraint({ name: 'hasSpecialChar' })
export class HasSpecialCharConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(config: ConfigService) {
    this._enabled = config.getOrThrow<boolean>(
      'PASSWORD_REQUIRE_SPECIAL_CHAR'
    );
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
