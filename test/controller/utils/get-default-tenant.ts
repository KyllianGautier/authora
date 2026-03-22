import { DataSource } from 'typeorm';
import { TenantEntity } from '../../../src/entity/tenant.entity';

export async function getDefaultTenant(
  dataSource: DataSource
): Promise<TenantEntity> {
  const tenant = await dataSource
    .getRepository(TenantEntity)
    .findOneBy({ slug: 'default' });

  if (tenant === null) {
    throw new Error('Default tenant not found — check test setup');
  }

  return tenant;
}
