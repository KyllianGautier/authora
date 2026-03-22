import {
  Column,
  CreateDateColumn,
  Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique
} from 'typeorm';
import { TenantEntity } from './tenant.entity';

@Entity('registration')
@Unique(['email', 'tenant'])
export class RegistrationEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'email', type: 'varchar' })
  email: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.registrations, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash: string;

  @Column({ name: 'email_verification_token_hash', type: 'varchar' })
  emailVerificationTokenHash: string;

  @Column({ name: 'email_verification_token_expires_at', type: 'timestamptz' })
  emailVerificationTokenExpiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
