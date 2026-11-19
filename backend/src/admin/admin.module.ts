import { Module } from '@nestjs/common';
import { ChatbotModule } from '../chatbot/chatbot.module';
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
import { AdminKnowledgeController } from './operations/admin-knowledge.controller';
import { AdminOperationsController } from './operations/admin-operations.controller';
import { AdminOperationsService } from './operations/admin-operations.service';

@Module({
  imports: [InventoryModule, OrdersModule, ChatbotModule],
  controllers: [
    AdminController,
    AdminInventoryController,
    AdminOrdersGatewayController,
    AdminAnalyticsController,
    AdminAlertsController,
    AdminOperationsController,
    AdminKnowledgeController,
  ],
  providers: [
    AdminInventoryService,
    AdminOrdersQueryService,
    AdminAnalyticsService,
    AdminOperationsService,
  ],
  exports: [
    AdminInventoryService,
    AdminOrdersQueryService,
    AdminAnalyticsService,
  ],
})
export class AdminModule {}
