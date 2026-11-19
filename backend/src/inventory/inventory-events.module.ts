import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryChangeEmitter } from './inventory-change-emitter.service';
import { InventoryPubSubService } from './inventory-pubsub.service';

// Shared by transaction owners; no dependency on NotificationsModule.
@Module({
  imports: [PrismaModule],
  providers: [InventoryPubSubService, InventoryChangeEmitter],
  exports: [InventoryPubSubService, InventoryChangeEmitter],
})
export class InventoryEventsModule {}
