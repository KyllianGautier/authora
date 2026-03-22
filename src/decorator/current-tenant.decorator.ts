import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantEntity } from '../entity/tenant.entity';

export const CurrentTenant = createParamDecorator(
  (_, ctx: ExecutionContext): TenantEntity => {
    return ctx.switchToHttp().getRequest()['tenant']
  }
)