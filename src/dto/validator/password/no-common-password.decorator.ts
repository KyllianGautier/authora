import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildBreachedPasswordRequest } from '../../../config/breached-password.client';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

@Injectable()
@ValidatorConstraint({ name: 'noCommonPassword', async: true })
export class NoCommonPasswordConstraint
  implements ValidatorConstraintInterface
{
  private readonly _enabled: boolean;

  constructor(config: ConfigService) {
    this._enabled = config.getOrThrow<boolean>(
      'PASSWORD_FORBID_COMMON_PASSWORD'
    );
  }

  async validate(value: unknown): Promise<boolean> {
    if (!this._enabled) return true;
    if (typeof value !== 'string') return true;

    const { url, valueToMatch } = buildBreachedPasswordRequest(value);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000)
      });

      if (!response.ok) return true;

      const body = await response.text();
      return !body.split('\n').some((line) => line.startsWith(valueToMatch));
    } catch {
      return true;
    }
  }

  defaultMessage(): string {
    return 'Password must not be a commonly used password';
  }
}

export function NoCommonPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: NoCommonPasswordConstraint
    });
  };
}
