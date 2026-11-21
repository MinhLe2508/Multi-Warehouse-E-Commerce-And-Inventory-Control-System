import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { Public } from '../core/decorators/public.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { MockPaymentDto } from './dto/mock-payment.dto';
import { PaymentsService } from './payments.service';
import { BankTransferService } from './bank-transfer.service';
import { ReconcileTransferDto } from './dto/reconcile-transfer.dto';
import {
  ClosePaymentSupportDto,
  RequestPaymentSupportDto,
} from './dto/payment-support.dto';
import { authorizeSePay, readSePayTransfer } from './sepay-webhook';
import { getVietQrRecipient } from './vietqr-config';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly bankTransfer: BankTransferService,
  ) {}

  @Public()
  @Get('methods')
  methods() {
    return { cod: true, bankTransfer: getVietQrRecipient() !== null };
  }

  @Get('bank-transfer/:orderId')
  @UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF)
  bankTransferInstructions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.bankTransfer.instructions(user.userId, orderId);
  }

  @Post('bank-transfer/:orderId/support')
  @UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF)
  @HttpCode(200)
  requestSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: RequestPaymentSupportDto,
  ) {
    return this.bankTransfer.requestSupport(
      user.userId,
      orderId,
      dto.bankReference,
    );
  }

  @Patch('bank-transfer/:paymentId/support')
  @UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  closeSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ClosePaymentSupportDto,
  ) {
    return this.bankTransfer.closeSupport(paymentId, user.userId, dto.note);
  }

  @Public()
  @Post('sepay/webhook')
  @HttpCode(200)
  async sePay(
    @Headers('x-sepay-timestamp') timestamp: string | undefined,
    @Headers('x-sepay-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    authorizeSePay(timestamp, signature, request.rawBody);
    const transfer = readSePayTransfer(request.body);
    if (transfer) await this.bankTransfer.record(transfer);
    return { success: true };
  }

  @Post('bank-transfer/:paymentId/reconcile')
  @UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ReconcileTransferDto,
  ) {
    return this.bankTransfer.record(
      { ...dto, receivedAt: new Date(dto.receivedAt), actorId: user.userId },
      paymentId,
    );
  }

  @Post('mock/:orderId')
  @UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF)
  process(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: MockPaymentDto,
  ) {
    return this.payments.process(
      user.userId,
      orderId,
      dto.transactionRef,
      dto.method,
      dto.approved,
    );
  }
}
