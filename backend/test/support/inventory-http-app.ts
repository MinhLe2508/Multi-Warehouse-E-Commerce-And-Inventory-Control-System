import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { type INestApplication } from '@nestjs/common';
import { InventoryController } from '../../src/inventory/inventory.controller';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { configureHttpApp } from '../../src/configure-app';

// No guard override: real JWT strategy, guards, DTOs, pipes, filter and HTTP stack.
export async function createInventoryHttpApp(
  prisma: unknown,
  inventory: unknown,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [PassportModule],
    controllers: [InventoryController],
    providers: [
      JwtStrategy,
      { provide: PrismaService, useValue: prisma },
      { provide: InventoryService, useValue: inventory },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureHttpApp(app);
  await app.init();
  return app;
}
