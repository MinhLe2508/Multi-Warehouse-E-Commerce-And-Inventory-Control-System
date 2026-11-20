// Exception Filter dùng chung cho các HTTP request của Backend.
// - Chuẩn hóa response lỗi thành một định dạng JSON thống nhất.
// - Giữ thông báo lỗi nghiệp vụ (4xx) và lỗi DTO Validation.
// - Che giấu chi tiết kỹ thuật đối với lõi server (5xx).
// - Ghi log để hỗ trợ debug và giám sát hệ thống.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { STATUS_CODES } from 'node:http';
import type { Request, Response } from 'express';

// Định dạng response lỗi thống nhất cho Frontend
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

// Thông báo chung cho lỗi phía Server
// Không trả về chi tiết kỹ thuật nội bộ cho Client
const INTERNAL_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau!';
const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';

// Mẫu nhận diện mã lỗi nghiệp vụ chuẩn UPPER_SNAKE_CASE (ví dụ: INSUFFICIENT_STOCK, RESERVATION_EXPIRED)
const BUSINESS_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

function defaultCodeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return statusCode >= 500 ? INTERNAL_ERROR_CODE : `HTTP_${statusCode}`;
  }
}

// @Catch() không truyền loại exception: Bắt các exception được NestJS chuyển dến HTTP exception layer.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // Giá trị mặc định cho lỗi không xác định.
    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = INTERNAL_ERROR_MESSAGE;
    let error: string = 'Internal Server Error';
    let code: string = INTERNAL_ERROR_CODE;

    // Xử lý các HTTP exception của NestJS.
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();

      // Mặc định tên lỗi và mã lỗi từ HTTP status.
      error = STATUS_CODES[statusCode] ?? 'HTTP Error';
      code = defaultCodeForStatus(statusCode);

      // Chỉ trả thông báo chi tiết và business code cho lỗi 4xx.
      // Lỗi 5xx sẽ được xử lý riêng để tránh lộ thông tin.
      if (statusCode < 500) {
        const exceptionResponse = exception.getResponse();

        if (typeof exceptionResponse === 'string') {
          message = exceptionResponse;
        } else if (
          typeof exceptionResponse === 'object' &&
          exceptionResponse !== null
        ) {
          const responseObject = exceptionResponse as Record<string, unknown>;

          const responseMessage = responseObject.message;
          const responseError = responseObject.error;
          const responseCode = responseObject.code;

          if (typeof responseMessage === 'string') {
            message = responseMessage;
          } else if (
            Array.isArray(responseMessage) &&
            responseMessage.every(
              (item): item is string => typeof item === 'string',
            )
          ) {
            message = responseMessage;
          } else {
            message = exception.message;
          }

          if (
            typeof responseError === 'string' &&
            responseError.trim().length > 0
          ) {
            error = responseError;
          }

          if (
            typeof responseCode === 'string' &&
            BUSINESS_CODE_PATTERN.test(responseCode.trim())
          ) {
            code = responseCode.trim();
          }
        } else {
          message = exception.message;
        }

        // Trường hợp service ném trực tiếp mã lỗi nghiệp vụ trong message (ví dụ: new ConflictException('INSUFFICIENT_STOCK'))
        if (
          code === defaultCodeForStatus(statusCode) &&
          typeof message === 'string' &&
          BUSINESS_CODE_PATTERN.test(message.trim())
        ) {
          code = message.trim();
        }
      }
    }

    // Mọi lỗi 5xx đều được che giấu thông tin nội bộ
    // Thông tin chi tiết vẫn được ghi trong Log Server.
    if (statusCode >= 500) {
      message = INTERNAL_ERROR_MESSAGE;
      error = STATUS_CODES[statusCode] ?? 'Server Error';
      code = INTERNAL_ERROR_CODE;
    }

    const path = request.path;
    const probeKey = process.env.MWH_STARTUP_PROBE_KEY;
    const isStartupProbe =
      statusCode === 401 &&
      request.method === 'GET' &&
      process.env.MWH_ADMIN_LOCAL === '1' &&
      process.connected === true &&
      request.socket.remoteAddress === '127.0.0.1' &&
      Boolean(probeKey) &&
      request.headers['x-mwh-startup-probe'] === probeKey;

    if (statusCode >= 500) {
      const errorDetails =
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception);

      this.logger.error(
        `${request.method} ${path} -> ${statusCode}`,
        errorDetails,
      );
    } else if (code === 'INSUFFICIENT_STOCK') {
      this.logger.debug(`${request.method} ${path} -> ${statusCode} (${code})`);
    } else if (!isStartupProbe) {
      this.logger.warn(`${request.method} ${path} -> ${statusCode} (${code})`);
    }

    if (response.headersSent) {
      return;
    }

    const body: ErrorResponseBody = {
      statusCode,
      error,
      code,
      message,
      path,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }
}
