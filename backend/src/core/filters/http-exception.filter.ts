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
interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

// Thông báo chung cho lỗi phía Server
// Không trả về chi tiết kỹ thuật nội bộ cho Client
const INTERNAL_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau!';


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

    // Xử lý các HTTP exception của NestJS.
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();

      // Mặc định tên lỗi từ HTTP status.
      error = STATUS_CODES[statusCode] ?? 'HTTP Error';

      // Chỉ trả thông báo chi tiết cho lỗi 4xx.
      // Lỗi 5xx sẽ được xử lý riêng để tránh lộ thông tin.
      if (statusCode < 500) {
        const exceptionResponse = exception.getResponse();

        if (typeof exceptionResponse === 'string') {
          message = exceptionResponse;
        } else if (
          typeof exceptionResponse === 'object' &&
          exceptionResponse !== null
        ) {
          const responseObject = exceptionResponse as Record<
            string,
            unknown
          >;

          const responseMessage = responseObject.message;
          const responseError = responseObject.error;

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
        } else {
          message = exception.message;
        }
      }
    }

    // Mọi lỗi 5xx đều được che giấu thông tin nội bộ
    // Thông tin chi tiết vẫn được ghi trong Log Server.
    if (statusCode >= 500) {
      message = INTERNAL_ERROR_MESSAGE;
      error = STATUS_CODES[statusCode] ?? 'Server Error';
    }

    const path = request.path;

    if (statusCode >= 500) {
      const errorDetails =
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception);

      this.logger.error(
        `${request.method} ${path} -> ${statusCode}`,
        errorDetails,
      );
    } else {
      this.logger.warn(
        `${request.method} ${path} -> ${statusCode}`,
      );
    }

    if (response.headersSent) {
      return;
    }

    const body: ErrorResponseBody = {
      statusCode,
      error,
      message,
      path,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }
}
