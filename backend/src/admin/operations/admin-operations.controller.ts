import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../../core/guards/password-changed.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import {
  AdminPageQuery,
  ChatListQuery,
  CustomerListQuery,
  InventoryAuditListQuery,
  KnowledgeListQuery,
  PaymentListQuery,
  ReservationListQuery,
} from './admin-list.dto';
import { AdminOperationsService } from './admin-operations.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOperationsController {
  constructor(private readonly operations: AdminOperationsService) {}

  @Get('payments')
  payments(@Query() query: PaymentListQuery) {
    return this.operations.listPayments(query);
  }

  @Get('inventory/reservations')
  reservations(@Query() query: ReservationListQuery) {
    return this.operations.listReservations(query);
  }

  @Get('inventory/audit-logs')
  inventoryAudit(@Query() query: InventoryAuditListQuery) {
    return this.operations.listInventoryAudit(query);
  }

  @Get('customers')
  customers(@Query() query: CustomerListQuery) {
    return this.operations.listCustomers(query);
  }

  @Get('customers/:id/orders')
  customerOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminPageQuery,
  ) {
    return this.operations.getCustomerOrders(id, query);
  }

  @Get('ai/chats')
  chats(@Query() query: ChatListQuery) {
    return this.operations.listChats(query);
  }

  @Get('ai/chats/:id/messages')
  chatMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminPageQuery,
  ) {
    return this.operations.getChatMessages(id, query);
  }

  @Get('ai/knowledge')
  knowledge(@Query() query: KnowledgeListQuery) {
    return this.operations.listKnowledge(query);
  }
}
