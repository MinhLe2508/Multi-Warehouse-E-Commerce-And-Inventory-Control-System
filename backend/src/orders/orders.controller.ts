import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

// API của KHÁCH HÀNG cho đơn hàng của chính mình (xem docs/api/openapi.yaml).
//
// Thứ tự guard theo contract: token hợp lệ (JwtAuthGuard) -> đã đổi mật khẩu lần đầu
// (PasswordChangedGuard, 403 PASSWORD_CHANGE_REQUIRED) -> đúng vai trò (RolesGuard).
// userId luôn lấy từ @CurrentUser() do server xác minh, KHÔNG bao giờ từ body.
//
// Chưa đăng ký JwtAuthGuard toàn cục nên gắn trực tiếp tại đây (giống AuthController).
// Nếu về sau đăng ký global, bỏ JwtAuthGuard khỏi @UseGuards để khỏi xác thực hai lần.
@Controller('orders')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Khung: hiện trả 501 cho tới khi OrdersService hoàn thiện ở Tuần 4.
  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }
}
