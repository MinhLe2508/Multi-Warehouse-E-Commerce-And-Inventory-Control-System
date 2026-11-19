import {
  HttpExceptionFilter,
  type ErrorResponseBody,
} from './http-exception.filter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  ArgumentsHost,
} from '@nestjs/common';
import {
  InsufficientStockException,
  InventoryNotFoundException,
  ReservationExpiredException,
} from '../../stock-reservation/stock-reservation.errors';

/**
 * Helper: Tạo mock ArgumentsHost cho HTTP context.
 */
function createMockHost(path = '/test') {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

  const mockRequest = { method: 'GET', path };
  const mockResponse = { status: mockStatus, headersSent: false };

  const host = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
  } as unknown as ArgumentsHost;

  return { host, mockStatus, mockJson, mockRequest, mockResponse };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('should return unified JSON format for all errors', () => {
    const { host, mockJson } = createMockHost();
    filter.catch(new NotFoundException('Not found'), host);

    const body = (mockJson.mock.calls as [[ErrorResponseBody]])[0][0];
    expect(body.statusCode).toBe(404);
    expect(typeof body.error).toBe('string');
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Not found');
    expect(body.path).toBe('/test');
    expect(typeof body.timestamp).toBe('string');
  });

  it('should handle 400 BadRequest with validation messages array', () => {
    const { host, mockJson, mockStatus } = createMockHost();
    const exception = new BadRequestException({
      message: ['email must be an email', 'name should not be empty'],
      error: 'Bad Request',
    });

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: ['email must be an email', 'name should not be empty'],
      }),
    );
  });

  it('should preserve 4xx business code (INSUFFICIENT_STOCK, RESERVATION_EXPIRED, PASSWORD_CHANGE_REQUIRED, INVENTORY_NOT_FOUND) and strip internal fields', () => {
    // 1. InsufficientStockException (409 INSUFFICIENT_STOCK, có kèm inventoryId nội bộ)
    const { host: h1, mockJson: j1 } = createMockHost('/orders');
    filter.catch(new InsufficientStockException(BigInt(99)), h1);
    const b1 = (j1.mock.calls as [[Record<string, unknown>]])[0][0];
    expect(b1.statusCode).toBe(409);
    expect(b1.code).toBe('INSUFFICIENT_STOCK');
    expect(b1.message).toBe('Không đủ hàng tồn kho để giữ chỗ.');
    // Không trả toàn bộ exception object (không lọt inventoryId nội bộ)
    expect(b1.inventoryId).toBeUndefined();

    // 2. ReservationExpiredException (409 RESERVATION_EXPIRED)
    const { host: h2, mockJson: j2 } = createMockHost('/payments');
    filter.catch(new ReservationExpiredException(), h2);
    const b2 = (j2.mock.calls as [[ErrorResponseBody]])[0][0];
    expect(b2.statusCode).toBe(409);
    expect(b2.code).toBe('RESERVATION_EXPIRED');

    // 3. PasswordChangedGuard (403 PASSWORD_CHANGE_REQUIRED)
    const { host: h3, mockJson: j3 } = createMockHost('/orders');
    filter.catch(
      new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message:
          'Bạn cần đổi mật khẩu lần đầu trước khi sử dụng chức năng này.',
      }),
      h3,
    );
    const b3 = (j3.mock.calls as [[ErrorResponseBody]])[0][0];
    expect(b3.statusCode).toBe(403);
    expect(b3.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // 4. InventoryNotFoundException (404 INVENTORY_NOT_FOUND)
    const { host: h4, mockJson: j4 } = createMockHost('/orders');
    filter.catch(new InventoryNotFoundException(BigInt(42)), h4);
    const b4 = (j4.mock.calls as [[Record<string, unknown>]])[0][0];
    expect(b4.statusCode).toBe(404);
    expect(b4.code).toBe('INVENTORY_NOT_FOUND');
    expect(b4.inventoryId).toBeUndefined();
  });

  it('should allow client to distinguish INSUFFICIENT_STOCK, RESERVATION_EXPIRED and generic CONFLICT without parsing Vietnamese message', () => {
    // OrdersService ném trực tiếp ConflictException('INSUFFICIENT_STOCK')
    const { host: hStock, mockJson: jStock } = createMockHost('/orders');
    filter.catch(new ConflictException('INSUFFICIENT_STOCK'), hStock);
    const bodyStock = (jStock.mock.calls as [[ErrorResponseBody]])[0][0];

    // ReservationExpiredException
    const { host: hExpired, mockJson: jExpired } = createMockHost('/payments');
    filter.catch(new ReservationExpiredException(), hExpired);
    const bodyExpired = (jExpired.mock.calls as [[ErrorResponseBody]])[0][0];

    // Generic ConflictException với thông báo tiếng Việt
    const { host: hGeneric, mockJson: jGeneric } = createMockHost('/orders/1');
    filter.catch(
      new ConflictException('Trạng thái đơn đã thay đổi.'),
      hGeneric,
    );
    const bodyGeneric = (jGeneric.mock.calls as [[ErrorResponseBody]])[0][0];

    expect(bodyStock.code).toBe('INSUFFICIENT_STOCK');
    expect(bodyExpired.code).toBe('RESERVATION_EXPIRED');
    expect(bodyGeneric.code).toBe('CONFLICT');
    expect(
      new Set([bodyStock.code, bodyExpired.code, bodyGeneric.code]).size,
    ).toBe(3);
  });

  it('should hide internal details, SQL, stack and raw codes for 500 errors', () => {
    const { host, mockJson, mockStatus } = createMockHost();
    filter.catch(
      new InternalServerErrorException({
        code: 'P2002',
        message: 'SELECT * FROM users WHERE password_hash = ...',
        sql: 'SELECT 1',
        meta: { target: ['email'] },
      }),
      host,
    );

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = (mockJson.mock.calls as [[Record<string, unknown>]])[0][0];
    // Không được lộ message gốc, mã lỗi DB hoặc metadata
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Đã xảy ra lỗi hệ thống, vui lòng thử lại sau!');
    expect(body.sql).toBeUndefined();
    expect(body.meta).toBeUndefined();
    expect(body.stack).toBeUndefined();
  });

  it('should handle unknown (non-HttpException) errors as 500 without leaking raw error properties', () => {
    const { host, mockStatus, mockJson } = createMockHost();
    const dbError = Object.assign(
      new Error('FATAL: password authentication failed for user "warehouse"'),
      { code: '28P01', detail: 'Connection matched pg_hba.conf' },
    );
    filter.catch(dbError, host);

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = (mockJson.mock.calls as [[Record<string, unknown>]])[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Đã xảy ra lỗi hệ thống, vui lòng thử lại sau!');
    expect(body.detail).toBeUndefined();
  });

  it('should include path and timestamp in response', () => {
    const { host, mockJson } = createMockHost('/api/products');
    filter.catch(new NotFoundException(), host);

    const body = (mockJson.mock.calls as [[ErrorResponseBody]])[0][0];
    expect(body.path).toBe('/api/products');
    expect(body.timestamp).toBeDefined();
    // Verify ISO format
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it('should not send response if headers already sent', () => {
    const { host, mockJson, mockResponse } = createMockHost();
    mockResponse.headersSent = true;

    filter.catch(new NotFoundException(), host);
    expect(mockJson).not.toHaveBeenCalled();
  });
});
