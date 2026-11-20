import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { MockPaymentGatewayService } from './mock-payment-gateway.service';
import { InventoryChangeEmitter } from '../inventory/inventory-change-emitter.service';
import { recordCustomerOrderNotice } from '../orders/customer-order-notice';
import { mockPaymentsEnabled } from './payment-mode';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockReservationService,
    private readonly gateway: MockPaymentGatewayService,
    private readonly changes: InventoryChangeEmitter,
  ) {}

  async process(
    userId: string,
    orderId: string,
    transactionRef: string,
    method: PaymentMethod,
    approved: boolean,
  ) {
    if (!mockPaymentsEnabled()) {
      throw new ForbiddenException('Phương thức thanh toán không khả dụng.');
    }
    if (method !== 'MOCK_CARD' && method !== 'MOCK_EWALLET')
      throw new ConflictException('Chỉ cho phép thanh toán mock.');
    const result = await this.prisma
      .$transaction(
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
          if (
            await tx.payment.findFirst({
              where: { orderId, method: 'BANK_TRANSFER' },
              select: { id: true },
            })
          ) {
            throw new ConflictException('Đơn yêu cầu đối soát chuyển khoản.');
          }
          if (
            order.reservationExpiresAt &&
            order.reservationExpiresAt.getTime() <= Date.now()
          ) {
            throw new ConflictException('RESERVATION_EXPIRED');
          }
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
            await recordCustomerOrderNotice(tx, order, 'CONFIRMED');
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
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'transactionRef đã thuộc giao dịch khác.',
          );
        }
        throw error;
      });
    if (!result.duplicate && approved) await this.changes.publishOrder(orderId);
    return result;
  }
}
