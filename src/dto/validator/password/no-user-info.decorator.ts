import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

const USER_INFO_MIN_LENGTH = 3;

@Injectable()
@ValidatorConstraint({ name: 'noUserInfo' })
export class NoUserInfoConstraint implements ValidatorConstraintInterface {
  private readonly _enabled: boolean;

  constructor(config: ConfigService) {
    this._enabled = config.getOrThrow<boolean>('PASSWORD_FORBID_USER_INFO');
  }

  validate(value: unknown, args?: ValidationArguments): boolean {
    if (!this._enabled) return true;
    if (typeof value !== 'string') return true;

    const emailField = args?.constraints?.[0] as string | undefined;
    const email = emailField
      ? (args?.object as Record<string, unknown>)?.[emailField]
      : undefined;

    if (typeof email !== 'string') return true;

    const lower = value.toLowerCase();
    const atIndex = email.indexOf('@');
    if (atIndex === -1) return true;

    const localPart = email.substring(0, atIndex).toLowerCase();
    const domain = email.substring(atIndex + 1).toLowerCase();

    const parts = localPart.split(/[.\-_+]/);

    const domainParts = domain.split('.');
    if (domainParts.length > 1) {
      domainParts.pop();
      parts.push(...domainParts);
    }

    for (const part of parts) {
      if (part.length >= USER_INFO_MIN_LENGTH && lower.includes(part)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'Password must not contain parts of your email';
  }
}

export interface NoUserInfoOptions extends ValidationOptions {
  emailField: string;
}

export function NoUserInfo(options: NoUserInfoOptions) {
  const { emailField, ...validationOptions } = options;
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [emailField],
      validator: NoUserInfoConstraint
    });
  };
}
