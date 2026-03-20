import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  HASH_MEMORY_COST,
  HASH_PARALLELISM,
  HASH_TIME_COST
} from '../config/constants';

@Injectable()
export class HashService {
  async hash(value: string): Promise<string> {
    return argon2.hash(value, {
      type: argon2.argon2id,
      memoryCost: HASH_MEMORY_COST,
      timeCost: HASH_TIME_COST,
      parallelism: HASH_PARALLELISM
    });
  }

  async verify(hash: string, value: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }
}
