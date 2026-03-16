import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

@Injectable()
@ValidatorConstraint({ name: 'hasMinLength' })
export class HasMinLengthConstraint implements ValidatorConstraintInterface {
  private readonly _minLength: number;

  constructor(config: ConfigService) {
    this._minLength = config.getOrThrow<number>('PASSWORD_MIN_LENGTH');
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
