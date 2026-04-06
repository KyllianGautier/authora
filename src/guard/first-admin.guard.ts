import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import type { Request } from 'express';
import { UserEntity, UserRole } from '../entity/user.entity';

@Injectable()
export class FirstAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req['user'] as UserEntity | undefined;

    if (user === undefined || user.role !== UserRole.FirstAdmin) {
      throw new ForbiddenException('First admin access required');
    }

    return true;
  }
}
