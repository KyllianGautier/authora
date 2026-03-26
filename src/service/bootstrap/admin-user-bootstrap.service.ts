import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { TenantEntityService } from '../entity-service/tenant-entity.service';
import { UserEntityService } from '../entity-service/user-entity.service';
import { PasswordEntityService } from '../entity-service/password-entity.service';
import { UserRole } from '../../entity/user.entity';
import { DEFAULT_TENANT_SLUG, TenantBootstrapService } from './tenant-bootstrap.service';

@Injectable()
export class AdminUserBootstrapService implements OnApplicationBootstrap {
  private readonly _logger = new Logger(AdminUserBootstrapService.name);
  private _bootstrapPromise: Promise<void> | null = null;

  constructor(
    private readonly _tenantBootstrap: TenantBootstrapService,
    private readonly _tenantService: TenantEntityService,
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _configService: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this._bootstrapPromise === null) {
      this._bootstrapPromise = this._bootstrap();
    }

    return this._bootstrapPromise;
  }

  private async _bootstrap(): Promise<void> {
    if (this._configService.getOrThrow('ENABLE_MULTI_TENANT')) return;

    await this._tenantBootstrap.onApplicationBootstrap();

    const defaultTenant = await this._tenantService.findBySlug(DEFAULT_TENANT_SLUG);

    if (defaultTenant === null) {
      throw new Error('Default tenant not found');
    }

    const email = this._configService.getOrThrow<string>('AUTHORA_ADMIN_EMAIL');

    const existingUser = await this._userEntityService.findByEmail(email);

    if (existingUser !== null) return;

    const user = await this._userEntityService.create({
      email,
      tenant: defaultTenant,
      role: UserRole.FirstAdmin
    });

    const clearPassword = randomBytes(5).toString('hex');

    await this._passwordEntityService.create({
      user,
      clearPassword
    });

    this._logger.warn(
      `Admin user created — email: ${email}, password: ${clearPassword} — save the password, it will never be shown again`
    );
  }
}
