import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { MockPaymentGatewayService } from './mock-payment-gateway.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockReservationService,
    private readonly gateway: MockPaymentGatewayService,
  ) {}

  async process(
    userId: string,
    orderId: string,
    transactionRef: string,
    method: PaymentMethod,
    approved: boolean,
  ) {
    if (method !== 'MOCK_CARD' && method !== 'MOCK_EWALLET')
      throw new ConflictException('Chỉ cho phép thanh toán mock.');
    return this.prisma.$transaction(
      async (tx) => {
        // Lock ORDER first, then stock service locks INVENTORY and RESERVATIONS.
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders WHERE id = ${orderId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
        if (!rows.length)
          throw new NotFoundException('Không tìm thấy đơn hàng.');
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        const existing = await tx.payment.findUnique({
          where: { transactionRef },
        });
        if (existing) {
          if (
            existing.orderId !== orderId ||
            existing.method !== method ||
            (existing.status === 'SUCCESS') !== approved
          )
            throw new ConflictException(
              'transactionRef đã thuộc giao dịch khác.',
            );
          return {
            transactionRef,
            status: existing.status,
            orderStatus: order.status,
            duplicate: true,
          };
        }
        if (order.status !== 'PENDING_PAYMENT')
          throw new ConflictException('Đơn không còn chờ thanh toán.');
        const result = this.gateway.charge(approved);
        // UNIQUE(transaction_ref) additionally rejects concurrent reuse across different orders.
        await tx.payment.create({
          data: {
            orderId,
            transactionRef,
            method,
            amount: order.grandTotal,
            currency: order.currency,
            status: result.approved ? 'SUCCESS' : 'FAILED',
            gatewayResponse: result,
            callbackCount: 1,
            processedAt: new Date(),
            failureReason: result.approved ? null : result.code,
          },
        });
        if (result.approved) {
          await this.stock.commitForOrder(tx, orderId, userId);
          const changed = await tx.order.updateMany({
            where: { id: orderId, status: 'PENDING_PAYMENT' },
            data: { status: 'CONFIRMED', confirmedAt: new Date() },
          });
          if (changed.count !== 1)
            throw new ConflictException('Trạng thái đơn đã thay đổi.');
          await tx.orderStatusHistory.create({
            data: {
              orderId,
              fromStatus: 'PENDING_PAYMENT',
              toStatus: 'CONFIRMED',
              actorId: userId,
              reason: 'Thanh toán mock thành công',
            },
          });
        }
        return {
          transactionRef,
          status: result.approved ? 'SUCCESS' : 'FAILED',
          orderStatus: result.approved ? 'CONFIRMED' : order.status,
          duplicate: false,
        };
      },
      {
        timeout: 30000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }
}
