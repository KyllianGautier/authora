import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { delay } from 'rxjs/operators';
import { DELAY_KEY } from '../decorator/delay.decorator';

@Injectable()
export class DelayInterceptor implements NestInterceptor {
  private readonly _minMs: number;
  private readonly _maxMs: number;

  constructor(
    private readonly _reflector: Reflector,
    private readonly _configService: ConfigService
  ) {
    this._minMs = this._configService.getOrThrow<number>('ENDPOINT_DELAY_MIN_MS');
    this._maxMs = this._configService.getOrThrow<number>('ENDPOINT_DELAY_MAX_MS');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const hasDelay = this._reflector.getAllAndOverride<boolean>(DELAY_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!hasDelay) {
      return next.handle();
    }

    const delayMs = Math.random() * (this._maxMs - this._minMs) + this._minMs;

    return next.handle().pipe(delay(delayMs));
  }
}
