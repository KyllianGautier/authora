import { Injectable, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantEntity } from '../entity/tenant.entity';
import { Repository } from 'typeorm';
import { NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {

  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const tenant: TenantEntity | null = await this.tenants.findOne({ where: { slug: 'default' } });

    if (tenant === null) {
      throw new ServiceUnavailableException('No tenant configured')
    }

    req['tenant'] = tenant;

    next();
  }

}