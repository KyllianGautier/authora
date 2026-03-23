import { Inject, Injectable } from '@nestjs/common';
import { buildBreachedPasswordRequest } from '../../../config/breached-password.client';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import type { AuthoraTenantConfig } from '../../../config/tenant-config';
import { TENANT_CONFIG } from '../../../config/tenant-config';

@Injectable()
@ValidatorConstraint({ name: 'noCommonPassword', async: true })
export class NoCommonPasswordConstraint
  implements ValidatorConstraintInterface
{
  private readonly _enabled: boolean;

  constructor(
    @Inject(TENANT_CONFIG) tenantConfig: AuthoraTenantConfig
  ) {
    this._enabled = tenantConfig.passwordForbidCommonPassword;
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
