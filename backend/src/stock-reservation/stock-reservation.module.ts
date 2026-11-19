import { Module } from '@nestjs/common';
import { InventoryAlertModule } from '../inventory/inventory-alert.module';
import { InventoryStockPort } from './inventory-stock.port';
import { PrismaInventoryStockAdapter } from './prisma-inventory-stock.adapter';
import { PrismaReservationRepository } from './prisma-reservation.repository';
import { ReservationRepository } from './reservation.repository';
import { StockReservationService } from './stock-reservation.service';

// PrismaModule là @Global nên không cần import lại.
@Module({
  imports: [InventoryAlertModule],
  providers: [
    StockReservationService,
    // Adapter giữ chỗ độc lập với nghiệp vụ nhập hàng/kiểm kê của InventoryService.
    { provide: InventoryStockPort, useClass: PrismaInventoryStockAdapter },
    { provide: ReservationRepository, useClass: PrismaReservationRepository },
  ],
  exports: [StockReservationService],
})
export class StockReservationModule {}
