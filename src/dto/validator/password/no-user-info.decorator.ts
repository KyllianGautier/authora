import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { TenantSetting } from '../../../config/settings';
import { SettingsService } from '../../../service/settings.service';

const USER_INFO_MIN_LENGTH = 3;

@Injectable()
@ValidatorConstraint({ name: 'noUserInfo', async: true })
export class NoUserInfoConstraint implements ValidatorConstraintInterface {
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown, args?: ValidationArguments): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordForbidUserInfo, '');
    if (!enabled) return true;
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
