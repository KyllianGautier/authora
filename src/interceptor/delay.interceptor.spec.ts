import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { testInfraConfig } from '../config/infra-config';
import { DelayInterceptor } from './delay.interceptor';

describe('DelayInterceptor', () => {
  let interceptor: DelayInterceptor;
  let reflector: Reflector;

  const mockExecutionContext = {
    getHandler: jest.fn(),
    getClass: jest.fn()
  } as unknown as ExecutionContext;

  const mockCallHandler: CallHandler = {
    handle: jest.fn(() => of({ result: 'test' }))
  };

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new DelayInterceptor(reflector, testInfraConfig);
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
        expect(elapsed).toBeGreaterThanOrEqual(testInfraConfig.endpointDelayMinMs);
        expect(value).toEqual({ result: 'test' });
      },
      complete: () => done()
    });
  });
});
