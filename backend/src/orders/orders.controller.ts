import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutQuoteDto } from './dto/checkout.dto';
import { CustomerOrdersQueryDto } from './dto/customer-orders-query.dto';
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
@Roles(UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  listOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerOrdersQueryDto,
  ) {
    return this.orders.listOwn(user.userId, query);
  }

  @Get(':id')
  getOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.getOwn(user.userId, id);
  }
  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }

  @Post('quote')
  @HttpCode(200)
  quote(@CurrentUser('userId') userId: string, @Body() dto: CheckoutQuoteDto) {
    return this.orders.quote(userId, dto);
  }

  @Patch(':id/cancel')
  cancelOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.cancelOwn(user.userId, id);
  }
}
