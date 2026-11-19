import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_PATH = '/products/uploads';
const FILE_NAME =
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|webp)$/;
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export interface ProductImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);
  private readonly validator = new FileTypeValidator({
    fileType: /^image\/(?:png|jpeg|webp)$/,
    overrideMimeType: true,
  });
  private readonly directory = this.storageDirectory();

  private storageDirectory(): string {
    const backend = resolve(__dirname, '../..');
    const configured = process.env.PRODUCT_IMAGE_DIR?.trim();
    if (configured) return resolve(backend, configured);
    const frontend = resolve(backend, '../frontend');
    return existsSync(join(frontend, 'package.json'))
      ? join(frontend, 'public', 'products', 'uploads')
      : join(backend, 'uploads', 'products');
  }

  async withUpload<T>(
    image: ProductImageFile | undefined,
    save: (imageUrl?: string) => Promise<T>,
  ): Promise<T> {
    if (!image) return save();
    if (image.buffer.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
      throw new PayloadTooLargeException('Ảnh minh họa tối đa 5 MB.');
    }
    if (!(await this.validator.isValid(image))) {
      throw new BadRequestException('Chọn ảnh PNG, JPG hoặc WebP hợp lệ.');
    }

    const extension =
      image.mimetype === 'image/jpeg' ? 'jpg' : image.mimetype.slice(6);
    const filename = `${randomUUID()}.${extension}`;
    const filePath = join(this.directory, filename);
    await mkdir(this.directory, { recursive: true });
    const file = await open(filePath, 'wx');
    try {
      try {
        await file.writeFile(image.buffer);
      } finally {
        await file.close();
      }
      return await save(`${PRODUCT_IMAGE_PATH}/${filename}`);
    } catch (error) {
      await unlink(filePath).catch(() =>
        this.logger.warn(`Không dọn được ảnh tải lên ${filename}.`),
      );
      throw error;
    }
  }

  async read(filename: string): Promise<StreamableFile> {
    const extension = FILE_NAME.exec(filename)?.[1];
    if (!extension) throw new NotFoundException('Không tìm thấy ảnh sản phẩm.');

    const file = await open(join(this.directory, filename), 'r').catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          throw new NotFoundException('Không tìm thấy ảnh sản phẩm.');
        }
        throw error;
      },
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile()) {
        throw new NotFoundException('Không tìm thấy ảnh sản phẩm.');
      }
      return new StreamableFile(file.createReadStream(), {
        type: CONTENT_TYPES[extension],
        length: stat.size,
      });
    } catch (error) {
      await file.close();
      throw error;
    }
  }
}
