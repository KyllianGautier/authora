import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { OneTimeTokenEntity } from '../entity/one-time-token.entity';

@Injectable()
export class JobService {
  constructor(
    @InjectRepository(OneTimeTokenEntity)
    private readonly _oneTimeTokenRepository: Repository<OneTimeTokenEntity>
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async revokeExpiredOneTimeTokens(): Promise<void> {
    await this._oneTimeTokenRepository.update(
      { revoked: false, expiredAt: LessThan(new Date()) },
      { revoked: true }
    );
  }
}
