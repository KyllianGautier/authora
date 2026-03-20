import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { ENTITY_SERVICES } from './entity-service';
import { HashService } from './hash.service';
import { REDIS_MODEL_SERVICES } from './redis-model-service';
import { JobService } from './job.service';
import { SignIn2Service } from './sign-in-2.service';
import { SignInService } from './sign-in.service';
import { SignUpService } from './sign-up.service';
import { TwoFactorAuthService } from './two-factor-auth.service';

export const SERVICES = [
  ...ENTITY_SERVICES,
  ...REDIS_MODEL_SERVICES,
  AuthService,
  EmailService,
  HashService,
  JobService,
  SignIn2Service,
  SignInService,
  SignUpService,
  TwoFactorAuthService
];
