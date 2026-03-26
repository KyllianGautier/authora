import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ApiKeyEntity } from './api-key.entity';
import { RegistrationEntity } from './registration.entity';
import { TenantConfigEntity } from './tenant-config.entity';
import { UserEntity } from './user.entity';


export enum IntegrationMode {
  FirstParty = 'first-party',
  ThirdParty = 'third-party',
  Hybrid = 'hybrid',
}

@Entity('tenant')
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'slug', unique: true })
  slug: string;

  @Column({ name: 'name' })
  name: string;

  @Column({
    name: 'integration_mode',
    type: 'enum',
    enum: IntegrationMode,
    default: IntegrationMode.Hybrid
  })
  integrationMode: IntegrationMode;

  @OneToMany(() => RegistrationEntity, (registration) => registration.tenant, {
    orphanedRowAction: 'delete'
  })
  registrations: RegistrationEntity[];

  @OneToMany(() => UserEntity, (user) => user.tenant, {
    orphanedRowAction: 'delete'
  })
  users: UserEntity[];

  @OneToMany(() => ApiKeyEntity, (apiKey) => apiKey.tenant, {
    orphanedRowAction: 'delete'
  })
  apiKeys: ApiKeyEntity[];

  @OneToMany(() => TenantConfigEntity, (config) => config.tenant, {
    orphanedRowAction: 'delete'
  })
  configs: TenantConfigEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}