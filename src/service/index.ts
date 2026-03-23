import { AccountService } from './account.service';
import { EmailService } from './email.service';
import { ENTITY_SERVICES } from './entity-service';
import { HashService } from './hash.service';
import { JobService } from './job.service';
import { REDIS_MODEL_SERVICES } from './redis-model-service';
import { SettingsService } from './settings.service';
import { SignInService } from './sign-in.service';
import { SignUpService } from './sign-up.service';
import { TwoFactorAuthService } from './two-factor-auth.service';
import { BOOTSTRAP_SERVICES } from './bootstrap';

export const SERVICES = [
  ...BOOTSTRAP_SERVICES,
  ...ENTITY_SERVICES,
  ...REDIS_MODEL_SERVICES,
  AccountService,
  EmailService,
  HashService,
  JobService,
  SettingsService,
  SignInService,
  SignUpService,
  TwoFactorAuthService
];
