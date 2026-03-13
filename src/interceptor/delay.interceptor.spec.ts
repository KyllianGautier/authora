import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { DelayInterceptor } from './delay.interceptor';

describe('DelayInterceptor', () => {
  let interceptor: DelayInterceptor;
  let reflector: Reflector;
  let configService: ConfigService;

  const mockExecutionContext = {
    getHandler: jest.fn(),
    getClass: jest.fn()
  } as unknown as ExecutionContext;

  const mockCallHandler: CallHandler = {
    handle: jest.fn(() => of({ result: 'test' }))
  };

  beforeEach(() => {
    reflector = new Reflector();
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'ENDPOINT_DELAY_MIN_MS') return 200;
        if (key === 'ENDPOINT_DELAY_MAX_MS') return 400;
      })
    } as unknown as ConfigService;

    interceptor = new DelayInterceptor(reflector, configService);
  });

  it('should not delay when @Delay() metadata is absent', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const start = Date.now();

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (value) => {
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(50);
        expect(value).toEqual({ result: 'test' });
      },
      complete: () => done()
    });
  });

  it('should delay when @Delay() metadata is present', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const start = Date.now();

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (value) => {
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(200);
        expect(elapsed).toBeLessThanOrEqual(600);
        expect(value).toEqual({ result: 'test' });
      },
      complete: () => done()
    });
  });

  it('should delay within the configured range', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const customConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'ENDPOINT_DELAY_MIN_MS') return 100;
        if (key === 'ENDPOINT_DELAY_MAX_MS') return 150;
      })
    } as unknown as ConfigService;

    const customInterceptor = new DelayInterceptor(
      reflector,
      customConfigService
    );

    const start = Date.now();

    customInterceptor
      .intercept(mockExecutionContext, mockCallHandler)
      .subscribe({
        next: (value) => {
          const elapsed = Date.now() - start;
          expect(elapsed).toBeGreaterThanOrEqual(100);
          expect(elapsed).toBeLessThanOrEqual(350);
          expect(value).toEqual({ result: 'test' });
        },
        complete: () => done()
      });
  });
});
