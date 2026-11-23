import { Module } from '@nestjs/common';
import { InventoryEventsModule } from '../inventory/inventory-events.module';
import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StockReservationModule } from '../stock-reservation/stock-reservation.module';
import { AdminOrdersController } from './admin-orders.controller';
import { InternalOrderController } from './internal-orders.controller';
import { InternalOrdersService } from './internal-orders.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PromotionsModule } from '../promotions/promotions.module';
import { CustomerDeliveryController } from './customer-delivery.controller';
import { CustomerDeliveryService } from './customer-delivery.service';

@Module({
  imports: [
    PrismaModule,
    PricingModule,
    StockReservationModule,
    InventoryEventsModule,
    PromotionsModule,
  ],
  controllers: [
    OrdersController,
    AdminOrdersController,
    InternalOrderController,
    CustomerDeliveryController,
  ],
  providers: [OrdersService, InternalOrdersService, CustomerDeliveryService],
  exports: [OrdersService, InternalOrdersService],
})
export class OrdersModule {}
