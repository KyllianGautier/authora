import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class HashService {
  private readonly _memoryCost: number;
  private readonly _timeCost: number;
  private readonly _parallelism: number;

  constructor(private readonly _configService: ConfigService) {
    this._memoryCost = this._configService.getOrThrow<number>('HASH_MEMORY_COST');
    this._timeCost = this._configService.getOrThrow<number>('HASH_TIME_COST');
    this._parallelism = this._configService.getOrThrow<number>('HASH_PARALLELISM');
  }

  async hash(value: string): Promise<string> {
    return argon2.hash(value, {
      type: argon2.argon2id,
      memoryCost: this._memoryCost,
      timeCost: this._timeCost,
      parallelism: this._parallelism
    });
  }

  async verify(hash: string, value: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }
}
