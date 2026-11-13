
import dotenv from 'dotenv';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Nạp .env từ thư mục gốc dự án,
// tính tương đối từ vị trí của prisma.config.ts.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
});
