import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { INFRA_CONFIG } from '../config/infra-config';
import type { AuthoraInfraConfig } from '../config/infra-config';

@Injectable()
export class HashService {
  constructor(
    @Inject(INFRA_CONFIG) private readonly _infraConfig: AuthoraInfraConfig
  ) {}

  async hash(value: string): Promise<string> {
    return argon2.hash(value, {
      type: argon2.argon2id,
      memoryCost: this._infraConfig.hashMemoryCost,
      timeCost: this._infraConfig.hashTimeCost,
      parallelism: this._infraConfig.hashParallelism
    });
  }

  async verify(hash: string, value: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }
}
