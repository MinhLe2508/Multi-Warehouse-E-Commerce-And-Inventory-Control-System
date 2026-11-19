import dotenv from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Server } from 'node:http';
import path from 'node:path';

import { configureHttpApp } from './configure-app';

// Nạp file .env ở thư mục gốc dự án, không phụ thuộc thư mục chạy lệnh.
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

// BigInt không serialize được bằng JSON.stringify -> chuyển thành chuỗi.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<INestApplication<Server>>(AppModule);
  configureHttpApp(app);
  app.enableShutdownHooks();
  const launchedLocally =
    process.env.MWH_ADMIN_LOCAL === '1' && process.connected;
  await app.listen(
    process.env.PORT ?? 3001,
    launchedLocally ? '127.0.0.1' : '0.0.0.0',
  );

  if (launchedLocally) {
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      await app.close();
      throw new Error('Không lấy được cổng HTTP của backend.');
    }
    process.once('disconnect', () => void app.close());
    process.send?.({ type: 'mwh-admin-backend-listening', port: address.port });
  }
}
void bootstrap();
