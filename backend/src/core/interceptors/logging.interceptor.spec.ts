import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

function createMockContext(
  type: string = 'http',
  method: string = 'GET',
  path: string = '/test',
): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({ method, path }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

function createMockCallHandler(returnValue: unknown = {}): CallHandler {
  return { handle: () => of(returnValue) };
}

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should log HTTP requests and pass through response', (done) => {
    const context = createMockContext('http', 'POST', '/api/orders');
    const handler = createMockCallHandler({ id: 1 });

    interceptor.intercept(context, handler).subscribe({
      next: (value) => {
        expect(value).toEqual({ id: 1 });
      },
      complete: () => {
        done();
      },
    });
  });

  it('should skip non-HTTP contexts (WebSocket)', (done) => {
    const context = createMockContext('ws');
    const handler = createMockCallHandler('ws-data');

    interceptor.intercept(context, handler).subscribe({
      next: (value) => {
        expect(value).toBe('ws-data');
      },
      complete: () => {
        done();
      },
    });
  });

  it('should not throw on empty response', (done) => {
    const context = createMockContext('http');
    const handler = createMockCallHandler(undefined);

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        done();
      },
    });
  });
});
