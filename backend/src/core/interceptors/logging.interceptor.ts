// Logging Interceptor dùng chung cho các HTTP request của Backend.
// - Ghi log method, path, HTTP status va thời gian xử lý
// - Hỗ trợ debug, theo dõi hiệu năng và kiểm tra API.
// - Không ghi request body, response body hoặc query string.
// - Chỉ xử lý HTTP context, bỏ qua WebSocket/RPC.

// Phân chia tách nhiệm:
// - LoggingInterceptor: ghi log luong xu ly thanh cong.
// - HttpExceptionFilter: ghi log cac exception.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {

    // Chỉ ghi log cho HTTP request, bỏ qua WebSocket và RPC context.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, path } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const elapsedMs = Date.now() - startedAt;
        const { statusCode } = response;

        this.logger.log(
          `${method} ${path} ${statusCode} - ${elapsedMs}ms`,
        );
      }),
    );
  }
}
