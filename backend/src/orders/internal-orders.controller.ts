import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
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
import { InternalOrderQueryDto } from './dto/internal-order-query.dto';
import { InternalOrdersService } from './internal-orders.service';

// Internal API cho Chatbot tra cứu đơn (STT 29, FR-BOT-03).
//
// "Chỉ trả đúng dữ liệu của user đang hỏi, không lộ đơn người khác":
//   1. JwtAuthGuard xác minh chữ ký/hạn token (không decode thủ công).
//   2. PasswordChangedGuard + RolesGuard(CUSTOMER) giống OrdersController.
//   3. :userId trên đường dẫn BẮT BUỘC trùng user trong JWT, nếu không -> 403.
//      Nhờ vậy dù ai đó (hoặc LLM bị prompt injection) ghép URL với userId khác
//      vẫn không đọc được gì; ADMIN/WAREHOUSE_STAFF cũng không dùng được route này.
//   4. Service luôn lọc WHERE user_id = userId và chỉ trả allow-list cột (không có PII giao hàng).
@Controller('internal/orders')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class InternalOrderController {
  constructor(private readonly internalOrders: InternalOrdersService) {}

  @Get(':userId')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: InternalOrderQueryDto,
  ) {
    if (userId !== user.userId) {
      throw new ForbiddenException(
        'Bạn chỉ được tra cứu đơn hàng của chính mình.',
      );
    }
    return this.internalOrders.findForUser(user.userId, query);
  }
}
