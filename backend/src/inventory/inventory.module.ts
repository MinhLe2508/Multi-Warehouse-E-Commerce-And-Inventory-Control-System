import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryPubSubService } from './inventory-pubsub.service';
import { ReservationCleanupJob } from './reservation-cleanup.job';

@Module({
  imports: [PrismaModule],
  providers: [InventoryPubSubService, ReservationCleanupJob],
  exports: [InventoryPubSubService],
})
export class InventoryModule {}
