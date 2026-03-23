import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from './tenant.entity';


@Entity('api_key')
export class ApiKeyEntity {

  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.apiKeys, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @Column({ name: 'publishable_key', unique: true })
  publishableKey: string;

  @Column({ name: 'secret_key_hash' })
  secretKeyHash: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}