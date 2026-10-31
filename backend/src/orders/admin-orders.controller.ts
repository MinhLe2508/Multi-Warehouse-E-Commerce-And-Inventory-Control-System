import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders/admin')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Patch(':id/status')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
  ) {
    return this.orders.changeStatus(id, dto.status, user.userId, dto.reason);
  }
}
