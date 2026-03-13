import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class AuthThrottleGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): Promise<void> {
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  protected override generateKey(
    context: ExecutionContext,
    _tracker: string,
    throttlerName: string
  ): string {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? '';
    const body = req.body as Record<string, unknown> | undefined;
    const rawEmail = body?.['email'];
    const email =
      typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : '';

    switch (throttlerName) {
      case 'identity':
        return `identity:${email || ip}`;
      case 'combined':
        return `combined:${email || 'unknown'}:${ip}`;
      case 'origin':
        return `origin:${ip}`;
      default:
        throw new Error('Unknown throttler name');
    }
  }
}
