import { Test } from '@nestjs/testing';
import { InventoryStockPort } from './inventory-stock.port';
import { PrismaInventoryStockAdapter } from './prisma-inventory-stock.adapter';
import { PrismaReservationRepository } from './prisma-reservation.repository';
import { ReservationRepository } from './reservation.repository';
import { StockReservationModule } from './stock-reservation.module';
import { StockReservationService } from './stock-reservation.service';

// Kiểm tra dependency injection thật của Nest: các lớp trừu tượng làm token phải
// được ánh xạ đúng sang bản Prisma, và service xuất ra được cho module khác dùng.
describe('StockReservationModule', () => {
  it('khởi tạo được và nối đúng InventoryStockPort / ReservationRepository', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StockReservationModule],
    }).compile();

    expect(moduleRef.get(StockReservationService)).toBeInstanceOf(
      StockReservationService,
    );
    expect(moduleRef.get(InventoryStockPort)).toBeInstanceOf(
      PrismaInventoryStockAdapter,
    );
    expect(moduleRef.get(ReservationRepository)).toBeInstanceOf(
      PrismaReservationRepository,
    );
  });
});
