import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StockReservationModule } from '../stock-reservation/stock-reservation.module';
import { AdminOrdersController } from './admin-orders.controller';
import { InternalOrderController } from './internal-orders.controller';
import { InternalOrdersService } from './internal-orders.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, PricingModule, StockReservationModule],
  controllers: [
    OrdersController,
    AdminOrdersController,
    InternalOrderController,
  ],
  providers: [OrdersService, InternalOrdersService],
  exports: [OrdersService, InternalOrdersService],
})
export class OrdersModule {}
