import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UserEntityService } from '../service/entity-service/user-entity.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly _jwtService: JwtService,
    private readonly _userEntityService: UserEntityService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    let payload: { sub: string; email: string };

    try {
      payload = await this._jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this._userEntityService.findById(payload.sub);

    if (user === null) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isLocked) {
      throw new UnauthorizedException('Account is locked');
    }

    req['user'] = user;

    return true;
  }
}
