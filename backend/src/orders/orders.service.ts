import { Injectable, NotImplementedException } from '@nestjs/common';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

/**
  OrdersService - KHUNG của Tuần 2.

  Luồng tạo đơn đầy đủ (STT 19, Tuần 4) sẽ làm trong MỘT transaction:
    1. Đọc sản phẩm active, lấy giá/discountPercent từ DB (không tin client).
    2. Chọn kho và giữ chỗ qua StockReservationService / fn_reserve_stock (Tuần 3).
    3. Tính tiền bằng PricingService.calculateOrder() và snapshot vào order_items.
    4. Ghi orders + order_status_history, rồi commit.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  create(userId: string, dto: CreateOrderDto): never {
    void userId;
    void dto;
    throw new NotImplementedException(
      'Tạo đơn hàng sẽ được triển khai ở Tuần 4 (OrdersService).',
    );
  }
}
