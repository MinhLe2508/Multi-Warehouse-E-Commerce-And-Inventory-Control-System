import { Module } from '@nestjs/common';
import { InventoryStockPort } from './inventory-stock.port';
import { PrismaInventoryStockAdapter } from './prisma-inventory-stock.adapter';
import { PrismaReservationRepository } from './prisma-reservation.repository';
import { ReservationRepository } from './reservation.repository';
import { StockReservationService } from './stock-reservation.service';

// PrismaModule là @Global nên không cần import lại.
@Module({
  providers: [
    StockReservationService,
    // Khi InventoryService (STT 13, Khang) hoàn thành, đổi useClass sang bản bọc nó.
    { provide: InventoryStockPort, useClass: PrismaInventoryStockAdapter },
    { provide: ReservationRepository, useClass: PrismaReservationRepository },
  ],
  exports: [StockReservationService],
})
export class StockReservationModule {}
