import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthoraSetting } from '../config/settings';
import { SettingsService } from './settings.service';

@Injectable()
export class HashService {
  constructor(
    private readonly _settingsService: SettingsService
  ) {}

  async hash(value: string): Promise<string> {
    const {
      hashMemoryCost: memoryCost,
      hashTimeCost: timeCost,
      hashParallelism: parallelism
    } = await this._settingsService.getMany([
      AuthoraSetting.HashMemoryCost,
      AuthoraSetting.HashTimeCost,
      AuthoraSetting.HashParallelism
    ]);

    return argon2.hash(value, {
      type: argon2.argon2id,
      memoryCost,
      timeCost,
      parallelism
    });
  }

  async verify(hash: string, value: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }
}
