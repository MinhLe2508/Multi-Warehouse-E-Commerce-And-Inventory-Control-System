import { Injectable, NotImplementedException } from '@nestjs/common';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { CreateOrderDto } from './dto/create-order.dto';

/**
  OrdersService - KHUNG (logic đầy đủ làm ở Tuần 4, STT 19).

  Luồng tạo đơn sẽ chạy trong MỘT transaction, THEO ĐÚNG THỨ TỰ NÀY:
    0. Đọc sản phẩm active + các dòng inventory ứng viên; chọn kho theo contract D05/D06.
    1. stockReservation.lockInventories(tx, inventoryIds)   <- khóa kho TRƯỚC (tăng dần).
       Bắt buộc trước khi INSERT order_items, nếu không hai đơn cùng sản phẩm sẽ
       deadlock (order_items giữ FOR KEY SHARE rồi fn_reserve_stock đòi FOR UPDATE).
       Sau khi khóa, availableStock đọc được là chính xác để lập phân bổ.
    2. Tính tiền bằng PricingService.calculateOrder(), tạo orders + order_items (snapshot).
    3. stockReservation.reserveForOrder(tx, orderId, allocations, userId).
    4. Ghi order_status_history (null -> PENDING_PAYMENT), rồi commit.
  Lỗi ở bất kỳ bước nào phải thoát khỏi transaction để rollback toàn bộ.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly stockReservation: StockReservationService,
  ) {}

  create(userId: string, dto: CreateOrderDto): never {
    void userId;
    void dto;
    throw new NotImplementedException(
      'Tạo đơn hàng sẽ được triển khai ở Tuần 4 (OrdersService).',
    );
  }
}
