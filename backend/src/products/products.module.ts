import { ManagedProductsController } from './managed-products.controller';
import { ManagedProductsService } from './managed-products.service';
import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProductsController, ManagedProductsController],
  providers: [ProductsService, ManagedProductsService],
})
export class ProductsModule {}
