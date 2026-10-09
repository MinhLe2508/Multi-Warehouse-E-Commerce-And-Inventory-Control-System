// =============================================================================
// Multi-Warehouse E-Commerce & Inventory Control System
// File: backend/src/core/interceptors/logging.interceptor.ts
// Owner: P4 (Backend Data Lead) — thuoc nhom "core/" (dung chung toan backend).
//
// MUC DICH: Interceptor DUNG CHUNG, duoc dang ky global trong main.ts qua
// "app.useGlobalInterceptors(new LoggingInterceptor())". Tu dong GHI LOG 1
// dong cho MOI request/response di qua server — gom: phuong thuc HTTP
// (GET/POST/...), duong dan, ma trang thai tra ve, va THOI GIAN XU LY (ms).
// Rat huu ich de:
//   1. Debug nhanh khi co loi (biet request nao vua chay, mat bao lau).
//   2. Chung minh he thong hoat dong dung trong bao cao do an (vi du: xem
//      log de thay 1 request dat hang bi tu choi dung luc het ton kho).
// =============================================================================

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
  // Dung context name "HTTP" (thay vi ten class) cho Logger — quy uoc pho
  // bien cua NestJS, giup dong log de nhan dien ngay la log request/response
  // khi doc chung voi cac dong log khac cua ung dung.
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // "switchToHttp()" chuyen ExecutionContext (vo huong, dung chung ca cho
    // WebSocket/RPC) ve dung ngu canh HTTP de lay duoc Request/Response that
    // su cua Express (platform-express ma Minh da chon trong package.json).
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, originalUrl } = request;

    // Ghi lai moc thoi gian NGAY TRUOC KHI Controller thuc su xu ly request
    // — Interceptor trong NestJS bao boc (wrap) ca luc TRUOC va SAU khi
    // Controller chay, nen day la vi tri dung de do thoi gian xu ly thuc te.
    const startedAt = Date.now();

    return next.handle().pipe(
      // "tap()" cho phep "nhin trom" ket qua/thoi diem response hoan tat ma
      // KHONG lam thay doi du lieu tra ve cho client (khac voi "map()" — se
      // bien doi du lieu) — dung dung muc dich CHI DE GHI LOG o day.
      tap(() => {
        const elapsedMs = Date.now() - startedAt;
        const { statusCode } = response;
        this.logger.log(`${method} ${originalUrl} ${statusCode} - ${elapsedMs}ms`);
      }),
    );
  }
}
