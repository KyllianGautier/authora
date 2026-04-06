import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserEntity } from '../entity/user.entity';

export const CurrentUser = createParamDecorator(
  (_, ctx: ExecutionContext): UserEntity => {
    return ctx.switchToHttp().getRequest()['user'];
  }
);
