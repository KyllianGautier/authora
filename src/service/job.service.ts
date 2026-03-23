import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { TenantSetting } from '../config/settings';
import { PasswordEntity, PasswordRevocationReason } from '../entity/password.entity';
import { SettingsService } from './settings.service';

@Injectable()
export class JobService {
  private readonly _logger = new Logger(JobService.name);

  constructor(
    @InjectRepository(PasswordEntity)
    private readonly _passwordRepository: Repository<PasswordEntity>,
    private readonly _settingsService: SettingsService
  ) {}

  @Cron('0 3 * * *')
  async revokeExpiredPasswords(): Promise<void> {
    // TODO: iterate over all tenants when multi-tenant is enabled
    const enabled = await this._settingsService.get(TenantSetting.PasswordExpirationEnabled, '');

    if (!enabled) {
      return;
    }

    const passwordMaxAgeSec = await this._settingsService.get(TenantSetting.PasswordMaxAgeSec, '');

    const expirationDate = DateTime.utc()
      .minus({ seconds: passwordMaxAgeSec })
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
