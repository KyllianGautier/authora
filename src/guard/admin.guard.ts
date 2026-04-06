import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import type { Request } from 'express';
import { UserEntity, UserRole } from '../entity/user.entity';

const ADMIN_ROLES = new Set<UserRole>([
  UserRole.Admin,
  UserRole.FirstAdmin
]);

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req['user'] as UserEntity | undefined;

    if (user === undefined || !ADMIN_ROLES.has(user.role)) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
