import { HttpExceptionFilter } from './http-exception.filter';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ArgumentsHost,
} from '@nestjs/common';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

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
        message: ['email must be an email', 'name should not be empty'],
      }),
    );
  });

  it('should hide internal details for 500 errors', () => {
    const { host, mockJson, mockStatus } = createMockHost();
    filter.catch(
      new InternalServerErrorException('DB connection failed'),
      host,
    );

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = (mockJson.mock.calls as [[ErrorResponseBody]])[0][0];
    // Không được lộ message gốc "DB connection failed"
    expect(body.message).not.toBe('DB connection failed');
    expect(body.message).toBe('Đã xảy ra lỗi hệ thống, vui lòng thử lại sau!');
  });

  it('should handle unknown (non-HttpException) errors as 500', () => {
    const { host, mockStatus, mockJson } = createMockHost();
    filter.catch(new Error('Something unexpected'), host);

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = (mockJson.mock.calls as [[ErrorResponseBody]])[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Đã xảy ra lỗi hệ thống, vui lòng thử lại sau!');
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
