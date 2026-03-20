import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ENDPOINT_DELAY_MAX_MS, ENDPOINT_DELAY_MIN_MS } from '../config/constants';
import { DELAY_KEY } from '../decorator/delay.decorator';

@Injectable()
export class DelayInterceptor implements NestInterceptor {
  constructor(private readonly _reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const hasDelay = this._reflector.getAllAndOverride<boolean>(DELAY_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!hasDelay) {
      return next.handle();
    }

    const delayMs =
      Math.random() * (ENDPOINT_DELAY_MAX_MS - ENDPOINT_DELAY_MIN_MS) +
      ENDPOINT_DELAY_MIN_MS;

    return next.handle().pipe(delay(delayMs));
  }
}
