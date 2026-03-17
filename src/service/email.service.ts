import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { EMAIL_QUEUE } from '../config/constants';

@Injectable()
export class EmailService {

  private readonly _baseUrl: string;

  constructor(
    @Inject(EMAIL_QUEUE) private readonly _emailClient: ClientProxy,
    private readonly _configService: ConfigService
  ) {
    this._baseUrl = this._configService.getOrThrow<string>('AUTHORA_BASE_URL');
  }

  async sendSignUpVerification(email: string, token: string): Promise<void> {
    await lastValueFrom(
      this._emailClient.emit('sign-up-verification', { email, token })
    );
  }

  async sendForgotPassword(email: string, token: string): Promise<void> {
    const authoraUiForgotPasswordLink =
      this._buildAuthoraUIForgotPasswordUrl(email, token);

    await lastValueFrom(
      this._emailClient.emit('forgot-password', {
        email,
        token,
        authoraUiForgotPasswordLink
      })
    );
  }

  private _buildAuthoraUIForgotPasswordUrl(
    email: string,
    token: string
  ): string {
    const url = new URL('/ui/en/forgot-password/verify', this._baseUrl);

    url.searchParams.set('email', email);
    url.searchParams.set('token', token);

    return url.toString();
  }

  async sendAccountDeletionVerification(
    email: string,
    token: string
  ): Promise<void> {
    await lastValueFrom(
      this._emailClient.emit('account-deletion-verification', {
        email,
        token
      })
    );
  }

  async sendMagicLink(
    email: string,
    token: string,
    redirectTo?: string,
    locale?: string
  ): Promise<void> {
    const authoraUiMagicLink = this._buildAuthoraUIMagicLinkUrl(
      email,
      token,
      redirectTo,
      locale
    );

    await lastValueFrom(
      this._emailClient.emit('magic-link', {
        email,
        token,
        authoraUiMagicLink
      })
    );
  }

  private _buildAuthoraUIMagicLinkUrl(
    email: string,
    token: string,
    redirectTo?: string,
    locale?: string
  ): string {
    const url = new URL(
      `/ui/${ locale ?? 'en' }/sign-in/magic-link/validate`,
      this._baseUrl
    );

    url.searchParams.set('email', email);
    url.searchParams.set('token', token);

    if (redirectTo !== undefined) {
      url.searchParams.set('redirectTo', redirectTo);
    }

    return url.toString();
  }
}
