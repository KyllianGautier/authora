import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

const REPEAT_MIN_LENGTH = 3;

@Injectable()
@ValidatorConstraint({ name: 'noRepeatedChars' })
export class NoRepeatedCharsConstraint
  implements ValidatorConstraintInterface
{
  private readonly _enabled: boolean;

  constructor(config: ConfigService) {
    this._enabled = config.getOrThrow<boolean>(
      'PASSWORD_FORBID_REPEATED_CHARS'
    );
  }

  validate(value: unknown): boolean {
    if (!this._enabled) return true;
    if (typeof value !== 'string') return true;

    const lower = value.toLowerCase();
    let run = 1;

    for (let i = 1; i < lower.length; i++) {
      if (lower[i] === lower[i - 1]) {
        run++;
        if (run >= REPEAT_MIN_LENGTH) return false;
      } else {
        run = 1;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'Password must not contain repeated characters';
  }
}

export function NoRepeatedChars(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: NoRepeatedCharsConstraint
    });
  };
}
