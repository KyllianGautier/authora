import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { delay } from 'rxjs/operators';
import { INFRA_CONFIG } from '../config/infra-config';
import type { AuthoraInfraConfig } from '../config/infra-config';
import { DELAY_KEY } from '../decorator/delay.decorator';

@Injectable()
export class DelayInterceptor implements NestInterceptor {
  constructor(
    private readonly _reflector: Reflector,
    @Inject(INFRA_CONFIG) private readonly _infraConfig: AuthoraInfraConfig
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const hasDelay = this._reflector.getAllAndOverride<boolean>(DELAY_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!hasDelay) {
      return next.handle();
    }

    const delayMs =
      Math.random() * (this._infraConfig.endpointDelayMaxMs - this._infraConfig.endpointDelayMinMs) +
      this._infraConfig.endpointDelayMinMs;

    return next.handle().pipe(delay(delayMs));
  }
}
