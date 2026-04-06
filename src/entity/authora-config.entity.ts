import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { defaultAuthoraConfig } from '../config/authora-config';

@Entity('authora_config')
export class AuthoraConfigEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'name', unique: true })
  name: string;

  @Column({ name: 'description', type: 'text', default: '' })
  description: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  // Argon2id hashing
  @Column({ name: 'hash_memory_cost', type: 'int', default: defaultAuthoraConfig.hashMemoryCost })
  hashMemoryCost: number;

  @Column({ name: 'hash_time_cost', type: 'int', default: defaultAuthoraConfig.hashTimeCost })
  hashTimeCost: number;

  @Column({ name: 'hash_parallelism', type: 'int', default: defaultAuthoraConfig.hashParallelism })
  hashParallelism: number;

  // Throttle
  @Column({ name: 'throttle_ttl_ms', type: 'int', default: defaultAuthoraConfig.throttleTtlMs })
  throttleTtlMs: number;

  @Column({ name: 'throttle_origin_limit', type: 'int', default: defaultAuthoraConfig.throttleOriginLimit })
  throttleOriginLimit: number;

  @Column({ name: 'throttle_identity_limit', type: 'int', default: defaultAuthoraConfig.throttleIdentityLimit })
  throttleIdentityLimit: number;

  @Column({ name: 'throttle_combined_limit', type: 'int', default: defaultAuthoraConfig.throttleCombinedLimit })
  throttleCombinedLimit: number;

  // Delay (timing attack mitigation)
  @Column({ name: 'endpoint_delay_min_ms', type: 'int', default: defaultAuthoraConfig.endpointDelayMinMs })
  endpointDelayMinMs: number;

  @Column({ name: 'endpoint_delay_max_ms', type: 'int', default: defaultAuthoraConfig.endpointDelayMaxMs })
  endpointDelayMaxMs: number;

  // Session & exchange TTLs (seconds)
  @Column({ name: 'auth_session_ttl_sec', type: 'int', default: defaultAuthoraConfig.authSessionTtlSec })
  authSessionTtlSec: number;

  @Column({ name: 'ott_exchange_ttl_sec', type: 'int', default: defaultAuthoraConfig.ottExchangeTtlSec })
  ottExchangeTtlSec: number;

  // Super admin
  @Column({ name: 'super_admin_jwt_expiration_sec', type: 'int', default: defaultAuthoraConfig.superAdminJwtExpirationSec })
  superAdminJwtExpirationSec: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
