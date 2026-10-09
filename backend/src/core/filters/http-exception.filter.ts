// =============================================================================
// Multi-Warehouse E-Commerce & Inventory Control System
// File: backend/src/core/filters/http-exception.filter.ts
// Owner: P4 (Backend Data Lead) — thuoc nhom "core/" (dung chung toan backend,
//        ai cung duoc THEM file moi vao day nhung KHONG duoc SUA/XOA file
//        nguoi khac da them, theo nguyen tac Module Ownership).
//
// MUC DICH: Bo loc loi (Exception Filter) DUNG CHUNG cho TOAN BO ung dung,
// duoc dang ky global trong main.ts qua "app.useGlobalFilters(new
// HttpExceptionFilter())". Bat (catch) MOI loi nem ra tu bat ky Controller/
// Service/Guard nao trong he thong, roi CHUAN HOA lai thanh 1 dinh dang JSON
// response DUY NHAT va NHAT QUAN, thay vi de NestJS tra ve dinh dang loi mac
// dinh (khac nhau tuy loai loi, kho doan truoc cho FE xu ly).
// =============================================================================

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Dinh dang chuan cua MOI response loi tra ve tu API — FE (P1/P2) co the
 * dua vao cau truc CO DINH nay de xu ly loi thong nhat o moi noi, khong can
 * doan xem field nao ton tai hay khong tuy tung loai loi.
 */
interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

// "@Catch()" KHONG truyen tham so -> bat TOAN BO moi loai exception (ca
// HttpException cua NestJS LAN loi JavaScript thuan/loi khong luong truoc
// duoc tu thu vien ngoai, vi du loi ket noi CSDL) — dam bao KHONG CO request
// nao "lot luoi" ma khong duoc chuan hoa dinh dang tra ve.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Gia tri MAC DINH danh cho truong hop XAU NHAT: loi khong luong truoc
    // duoc (vi du: loi ket noi CSDL, loi logic chua bat exception ro rang)
    // -> luon tra ve 500, va KHONG BAO GIO lo chi tiet ky thuat that (stack
    // trace, thong diep loi noi bo) ra ngoai cho client — chi log chi tiet
    // o phia SERVER (xem khoi "if (statusCode >= 500)" ben duoi), tranh ro
    // ri thong tin he thong co the bi ke xau loi dung.
    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Da xay ra loi he thong, vui long thu lai sau.';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      // Truong hop PHO BIEN NHAT: loi duoc Controller/Service/Guard CHU
      // DICH nem ra (vi du: "throw new BadRequestException('INSUFFICIENT_STOCK')"
      // tu luc goi fn_reserve_stock() that bai) — lay dung statusCode va
      // message ma noi nem loi da khai bao.
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        // ValidationPipe (da bat trong main.ts) khi tu choi 1 DTO khong hop
        // le se nem ra object dang { statusCode, message: string[], error }
        // — lay dung field "message" (co the la MANG nhieu loi validate
        // cung luc, vi du ["email must be an email", "password is too short"]).
        const resObj = res as Record<string, unknown>;
        message = (resObj.message as string | string[] | undefined) ?? exception.message;
        error = (resObj.error as string | undefined) ?? error;
      }
    } else if (exception instanceof Error) {
      // Loi JavaScript thuan (khong phai HttpException) — vi du 1 loi tu
      // thu vien "pg"/Prisma khong duoc bat rieng. Van tra statusCode 500
      // mac dinh, nhung lay message that de GHI LOG (khong tra ve client).
      message = 'Da xay ra loi he thong, vui long thu lai sau.';
      this.logger.error(
        `Loi KHONG LUONG TRUOC (khong phai HttpException): ${exception.message}`,
        exception.stack,
      );
    }

    // Phan biet muc do log theo statusCode:
    //   - >= 500 (loi phia SERVER, ngoai y muon) -> log o muc ERROR, kem
    //     stack trace day du, giup debug nhanh khi co su co that.
    //   - < 500 (loi phia CLIENT, vi du 400/401/403/404 — nguoi dung gui
    //     sai du lieu hoac khong co quyen) -> chi log o muc WARN, khong
    //     can stack trace vi day la hanh vi "binh thuong" cua he thong
    //     (tu choi request khong hop le), khong phai su co ky thuat.
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${statusCode}`);
    }

    const body: ErrorResponseBody = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }
}
