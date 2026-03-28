import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NextFunction } from 'express';
import { ApiKeyEntity } from '../entity/api-key.entity';

@Injectable()
export class ClientMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly _apiKeys: Repository<ApiKeyEntity>
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const publishableKey = req.headers['x-authora-key'] as string | undefined;

    if (publishableKey === undefined) {
      throw new UnauthorizedException('Missing X-Authora-Key header');
    }

    const apiKey = await this._apiKeys.findOne({
      where: { publishableKey, isActive: true },
      relations: { tenant: true }
    });

    if (apiKey === null) {
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    const existingTenant = req['tenant'];

    if (existingTenant !== undefined && existingTenant.id !== apiKey.tenant.id) {
      throw new UnauthorizedException('API key does not match the resolved tenant');
    }

    req['tenant'] = apiKey.tenant;
    req['apiKey'] = apiKey;

    next();
  }
}
