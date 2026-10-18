import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

// API của KHÁCH HÀNG cho đơn hàng của chính mình (xem docs/api/openapi.yaml).
// JwtAuthGuard phải chạy trước RolesGuard.
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Khung: hiện trả 501 cho tới khi OrdersService hoàn thiện ở Tuần 4.
  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }
}
