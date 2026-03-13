import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { ENTITY_SERVICES } from './entity-service';
import { HashService } from './hash.service';
import { JobService } from './job.service';
import { SignInService } from './sign-in.service';
import { SignUpService } from './sign-up.service';
import { TwoFactorAuthService } from './two-factor-auth.service';

export const SERVICES = [
  ...ENTITY_SERVICES,
  AuthService,
  EmailService,
  HashService,
  JobService,
  SignInService,
  SignUpService,
  TwoFactorAuthService
];
