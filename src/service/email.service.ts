import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { EMAIL_QUEUE } from '../config/constants';

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_QUEUE) private readonly _emailClient: ClientProxy
  ) {}

  async sendSignUpVerification(email: string, token: string): Promise<void> {
    await lastValueFrom(
      this._emailClient.emit('sign-up-verification', { email, token })
    );
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

}
