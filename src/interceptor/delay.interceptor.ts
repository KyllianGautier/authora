import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from } from 'rxjs';
import { delay, switchMap } from 'rxjs/operators';
import { AuthoraSetting } from '../config/settings';
import { DELAY_KEY } from '../decorator/delay.decorator';
import { SettingsService } from '../service/settings.service';

@Injectable()
export class DelayInterceptor implements NestInterceptor {
  constructor(
    private readonly _reflector: Reflector,
    private readonly _settingsService: SettingsService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const hasDelay = this._reflector.getAllAndOverride<boolean>(DELAY_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!hasDelay) {
      return next.handle();
    }

    return from(this._getDelayMs()).pipe(
      switchMap((delayMs) => next.handle().pipe(delay(delayMs)))
    );
  }

  private async _getDelayMs(): Promise<number> {
    const {
      endpointDelayMinMs: min,
      endpointDelayMaxMs: max
    } = await this._settingsService.getMany([
      AuthoraSetting.EndpointDelayMinMs,
      AuthoraSetting.EndpointDelayMaxMs
    ]);

    return Math.random() * (max - min) + min;
  }
}
