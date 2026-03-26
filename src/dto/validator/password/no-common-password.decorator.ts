import { Injectable } from '@nestjs/common';
import { buildBreachedPasswordRequest } from '../../../config/breached-password.client';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { TenantSetting } from '../../../config/settings';
import { SettingsService } from '../../../service/settings.service';

@Injectable()
@ValidatorConstraint({ name: 'noCommonPassword', async: true })
export class NoCommonPasswordConstraint
  implements ValidatorConstraintInterface
{
  constructor(private readonly _settingsService: SettingsService) {}

  async validate(value: unknown): Promise<boolean> {
    const enabled = await this._settingsService.get(TenantSetting.PasswordForbidCommonPassword, '');
    if (!enabled) return true;
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
