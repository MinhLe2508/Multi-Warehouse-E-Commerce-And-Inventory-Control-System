import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
