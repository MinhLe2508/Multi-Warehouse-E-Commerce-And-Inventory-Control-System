import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminController } from './admin.controller';
import { AdminAlertsController } from './alerts/admin-alerts.controller';
import { AdminAnalyticsController } from './analytics/admin-analytics.controller';
import { AdminAnalyticsService } from './analytics/admin-analytics.service';
import { AdminInventoryController } from './inventory/admin-inventory.controller';
import { AdminInventoryService } from './inventory/admin-inventory.service';
import { AdminOrdersGatewayController } from './orders/admin-orders.controller';
import { AdminOrdersQueryService } from './orders/admin-orders.service';

@Module({
  imports: [InventoryModule, OrdersModule],
  controllers: [
    AdminController,
    AdminInventoryController,
    AdminOrdersGatewayController,
    AdminAnalyticsController,
    AdminAlertsController,
  ],
  providers: [
    AdminInventoryService,
    AdminOrdersQueryService,
    AdminAnalyticsService,
  ],
  exports: [
    AdminInventoryService,
    AdminOrdersQueryService,
    AdminAnalyticsService,
  ],
})
export class AdminModule {}
