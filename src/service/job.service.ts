import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { TENANT_CONFIG } from '../config/tenant-config';
import type { AuthoraTenantConfig } from '../config/tenant-config';
import { PasswordEntity, PasswordRevocationReason } from '../entity/password.entity';

@Injectable()
export class JobService {
  private readonly _logger = new Logger(JobService.name);

  constructor(
    @InjectRepository(PasswordEntity)
    private readonly _passwordRepository: Repository<PasswordEntity>,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
  ) {}

  @Cron('0 3 * * *')
  async revokeExpiredPasswords(): Promise<void> {
    if (!this._tenantConfig.passwordExpirationEnabled) {
      return;
    }

    const expirationDate = DateTime.utc()
      .minus({ seconds: this._tenantConfig.passwordMaxAgeSec })
      .toJSDate();

    const result = await this._passwordRepository
      .createQueryBuilder()
      .update(PasswordEntity)
      .set({
        revoked: true,
        revocationReason: PasswordRevocationReason.Expired,
        revokedAt: DateTime.utc().toJSDate()
      })
      .where('revoked = false')
      .andWhere('created_at <= :expirationDate', { expirationDate })
      .execute();

    if (result.affected && result.affected > 0) {
      this._logger.log(`Revoked ${result.affected} expired password(s)`);
    }
  }
}
