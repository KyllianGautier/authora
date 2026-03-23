import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { testAuthoraConfig } from '../config/authora-config';
import { AuthoraSetting } from '../config/settings';
import { DelayInterceptor } from './delay.interceptor';
import type { SettingsService } from '../service/settings.service';

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

  const mockSettingsService: Partial<SettingsService> = {
    get: jest.fn().mockImplementation(
      (key: AuthoraSetting) => Promise.resolve(testAuthoraConfig[key])
    ),
    getMany: jest.fn().mockImplementation(
      (keys: AuthoraSetting[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) result[key] = testAuthoraConfig[key];
        return Promise.resolve(result);
      }
    )
  };

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new DelayInterceptor(
      reflector,
      mockSettingsService as SettingsService
    );
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
        expect(elapsed).toBeGreaterThanOrEqual(testAuthoraConfig.endpointDelayMinMs);
        expect(value).toEqual({ result: 'test' });
      },
      complete: () => done()
    });
  });
});
