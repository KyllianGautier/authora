import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { EMAIL_QUEUE } from '../config/constants';
import { TenantSetting } from '../config/settings';
import { IntegrationMode } from '../entity/integration-mode.enum';
import { SettingsService } from './settings.service';

interface SignUpVerificationPayload {
  email: string;
  token: string;
}

interface ForgotPasswordPayload {
  email: string;
  token: string;
  authoraUiForgotPasswordLink?: string;
}

interface AccountDeletionPayload {
  email: string;
  token: string;
}

interface MagicLinkPayload {
  email: string;
  token: string;
  authoraUiMagicLink?: string;
}

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_QUEUE) private readonly _emailClient: ClientProxy,
    private readonly _settingsService: SettingsService
  ) {}

  async sendSignUpVerification(email: string, token: string): Promise<void> {
    const payload: SignUpVerificationPayload = { email, token };

    await lastValueFrom(
      this._emailClient.emit('sign-up-verification', payload)
    );
  }

  async sendForgotPassword(email: string, token: string, tenantId: string): Promise<void> {
    const integrationMode = await this._settingsService.get(TenantSetting.IntegrationMode, tenantId);

    const payload: ForgotPasswordPayload = { email, token };

    if (integrationMode !== IntegrationMode.FirstParty) {
      payload.authoraUiForgotPasswordLink = await this._buildForgotPasswordLink(email, token, tenantId);
    }

    await lastValueFrom(
      this._emailClient.emit('forgot-password', payload)
    );
  }

  async sendAccountDeletionVerification(
    email: string,
    token: string
  ): Promise<void> {
    const payload: AccountDeletionPayload = { email, token };

    await lastValueFrom(
      this._emailClient.emit('account-deletion-verification', payload)
    );
  }

  async sendMagicLink(
    email: string,
    token: string,
    tenantId: string,
    redirectTo?: string,
    locale?: string
  ): Promise<void> {
    const integrationMode = await this._settingsService.get(TenantSetting.IntegrationMode, tenantId);

    const payload: MagicLinkPayload = { email, token };

    if (integrationMode !== IntegrationMode.FirstParty) {
      payload.authoraUiMagicLink = await this._buildMagicLinkUrl(email, token, tenantId, redirectTo, locale);
    }

    await lastValueFrom(
      this._emailClient.emit('magic-link', payload)
    );
  }

  private async _buildForgotPasswordLink(
    email: string,
    token: string,
    tenantId: string
  ): Promise<string> {
    const baseUrl = await this._settingsService.get(TenantSetting.AuthoraUiBaseUrl, tenantId);
    const url = new URL('/forgot-password/verify', baseUrl);

    url.searchParams.set('email', email);
    url.searchParams.set('token', token);

    return url.toString();
  }

  private async _buildMagicLinkUrl(
    email: string,
    token: string,
    tenantId: string,
    redirectTo?: string,
    locale?: string
  ): Promise<string> {
    const baseUrl = await this._settingsService.get(TenantSetting.AuthoraUiBaseUrl, tenantId);
    const url = new URL(
      `/${locale ?? 'en'}/sign-in/magic-link/validate`,
      baseUrl
    );

    url.searchParams.set('email', email);
    url.searchParams.set('token', token);

    if (redirectTo !== undefined) {
      url.searchParams.set('redirectTo', redirectTo);
    }

    return url.toString();
  }
}
