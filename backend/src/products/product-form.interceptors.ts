import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { PRODUCT_IMAGE_MAX_BYTES } from './product-images.service';

@Injectable()
class DecodeProductForm implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.is('multipart/form-data')) {
      const body = request.body as { product?: unknown } | undefined;
      if (typeof body?.product !== 'string') {
        throw new BadRequestException('Thiếu thông tin sản phẩm.');
      }
      let product: unknown;
      try {
        product = JSON.parse(body.product) as unknown;
      } catch {
        throw new BadRequestException('Thông tin sản phẩm không hợp lệ.');
      }
      if (!product || typeof product !== 'object' || Array.isArray(product)) {
        throw new BadRequestException('Thông tin sản phẩm không hợp lệ.');
      }
      request.body = product;
    }
    return next.handle();
  }
}

// FileInterceptor đọc multipart trước khi DTO sản phẩm chạy qua ValidationPipe.
export const PRODUCT_FORM_INTERCEPTORS = [
  FileInterceptor('image', {
    limits: {
      fileSize: PRODUCT_IMAGE_MAX_BYTES + 1,
      files: 1,
      fields: 1,
      fieldSize: 64 * 1024,
      parts: 3,
    },
  }),
  DecodeProductForm,
];
