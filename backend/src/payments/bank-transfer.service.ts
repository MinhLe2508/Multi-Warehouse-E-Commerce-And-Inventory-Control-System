import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryChangeEmitter } from '../inventory/inventory-change-emitter.service';
import { recordCustomerOrderNotice } from '../orders/customer-order-notice';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationExpiredException } from '../stock-reservation/stock-reservation.errors';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import {
  buildSePayQrUrl,
  buildVietQrMemo,
  MAX_VND_TRANSFER,
  TRANSFER_CODE_PATTERN,
} from './vietqr';
import {
  canSimulateSePay,
  readVietQrBank,
  readVietQrRecipient,
  SEPAY_DEV_CONFIRMATION,
  SEPAY_DEV_RECEIPT_PREFIX,
  wasSePaySimulated,
} from './vietqr-config';
import type { IncomingTransfer } from './sepay-webhook';
import {
  PAYMENT_SUPPORT_WAIT_MS,
  paymentReservationStart,
  paymentSupportSelect,
  paymentWindowStartsAt,
} from './payment-support-policy';

type ReceiptIssue =
  | 'AMOUNT_MISMATCH'
  | 'OUTSIDE_PAYMENT_WINDOW'
  | 'ORDER_CLOSED'
  | 'ALREADY_PAID';

@Injectable()
export class BankTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockReservationService,
    private readonly changes: InventoryChangeEmitter,
  ) {}

  async instructions(userId: string, orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        method: 'BANK_TRANSFER',
        status: 'PENDING',
        NOT: { supportRequest: { is: { status: 'OPEN' } } },
        order: {
          userId,
          status: 'PENDING_PAYMENT',
          reservationExpiresAt: { gt: new Date() },
        },
      },
      select: { transactionRef: true, amount: true, gatewayResponse: true },
    });
    const recipient = readVietQrRecipient(payment?.gatewayResponse);
    const bank = readVietQrBank(recipient?.bankBin);
    const amount = payment?.amount.toNumber() ?? 0;
    if (
      !payment ||
      !recipient ||
      !bank ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > MAX_VND_TRANSFER ||
      !TRANSFER_CODE_PATTERN.test(payment.transactionRef)
    ) {
      throw new NotFoundException('Mã QR của đơn không còn hiệu lực.');
    }
    const accountNumber = recipient.virtualAccount ?? recipient.accountNumber;
    const transferMemo = buildVietQrMemo(recipient, payment.transactionRef);
    return {
      bankName: bank.bankName,
      accountName: recipient.accountName,
      accountNumber,
      transferCode: payment.transactionRef,
      transferMemo,
      amount: String(amount),
      canSimulate: canSimulateSePay(),
      qrImage: buildSePayQrUrl(
        bank.bankBin,
        accountNumber,
        amount,
        transferMemo,
      ),
    };
  }

  async simulate(userId: string, orderId: string) {
    if (!canSimulateSePay()) {
      throw new NotFoundException('Chế độ giả lập SePay chưa bật.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, method: 'BANK_TRANSFER', order: { userId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        transactionRef: true,
        amount: true,
        gatewayResponse: true,
      },
    });
    const recipient = readVietQrRecipient(payment?.gatewayResponse);
    if (!payment || !recipient) {
      throw new NotFoundException('Không tìm thấy đơn VietQR của bạn.');
    }
    const result = await this.recordTransfer(
      {
        transferCode: payment.transactionRef,
        amount: payment.amount.toNumber(),
        receivedAt: new Date(),
        bankBin: recipient.bankBin,
        accountNumber: recipient.accountNumber,
        virtualAccount: recipient.virtualAccount,
        providerId: SEPAY_DEV_RECEIPT_PREFIX + payment.id,
        actorId: userId,
      },
      { simulated: true },
    );
    if (!result.applied && !result.duplicate) {
      throw new ConflictException('Không thể giả lập thanh toán cho đơn này.');
    }
    return { simulated: true };
  }

  async requestSupport(
    userId: string,
    orderId: string,
    bankReference?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [owned] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders WHERE id = ${orderId}::uuid AND user_id = ${userId}::uuid FOR UPDATE
      `;
      if (!owned) throw new NotFoundException('Không tìm thấy đơn hàng.');

      const payment = await tx.payment.findFirst({
        where: { orderId, method: 'BANK_TRANSFER' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          order: { include: { reservations: paymentReservationStart } },
          supportRequest: { select: paymentSupportSelect },
        },
      });
      if (!payment) throw new NotFoundException('Đơn hàng không dùng VietQR.');
      if (payment.supportRequest) return payment.supportRequest;
      if (
        payment.status !== 'PENDING' ||
        !['PENDING_PAYMENT', 'CANCELLED'].includes(payment.order.status)
      ) {
        throw new ConflictException('Đơn hàng đã cập nhật thanh toán.');
      }
      const [clock] = await tx.$queryRaw<
        Array<{ now: Date }>
      >`SELECT clock_timestamp() AS now`;
      if (
        clock.now.getTime() <
        paymentWindowStartsAt(payment.order).getTime() + PAYMENT_SUPPORT_WAIT_MS
      ) {
        throw new ConflictException({
          code: 'PAYMENT_SUPPORT_TOO_SOON',
          message: 'Bạn có thể gửi yêu cầu sau 30 giây kể từ khi tạo đơn.',
        });
      }
      const request = await tx.paymentSupportRequest.create({
        data: { paymentId: payment.id, bankReference, createdAt: clock.now },
        select: paymentSupportSelect,
      });
      const admins = await tx.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });
      await tx.notification.createMany({
        data: admins.map(({ id }) => ({
          userId: id,
          type: 'ORDER_UPDATE',
          title: 'Có yêu cầu đối soát VietQR',
          body: payment.order.orderCode,
          referenceType: 'PaymentSupport',
          referenceId: orderId,
        })),
      });
      return request;
    });
  }

  async closeSupport(paymentId: string, actorId: string, note: string) {
    const reference = await this.prisma.payment.findUnique({
      where: { id: paymentId, method: 'BANK_TRANSFER' },
      select: { orderId: true },
    });
    if (!reference)
      throw new NotFoundException('Không tìm thấy giao dịch VietQR.');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${reference.orderId}::uuid FOR UPDATE`;
      const closed = await tx.paymentSupportRequest.updateMany({
        where: { paymentId, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          resolvedAt: new Date(),
          resolvedById: actorId,
          resolutionNote: note,
        },
      });
      if (!closed.count) {
        throw new ConflictException('Yêu cầu đối soát đã được xử lý.');
      }
      const order = await tx.order.findUniqueOrThrow({
        where: { id: reference.orderId },
        select: { userId: true, orderCode: true },
      });
      await tx.notification.create({
        data: {
          userId: order.userId,
          type: 'ORDER_UPDATE',
          title: 'Có kết quả yêu cầu đối soát VietQR',
          body: order.orderCode,
          referenceType: 'Order',
          referenceId: reference.orderId,
        },
      });
      return { closed: true };
    });
  }

  async confirmManually(paymentId: string, actorId: string) {
    const reference = await this.prisma.payment.findUnique({
      where: { id: paymentId, method: 'BANK_TRANSFER' },
      select: { orderId: true },
    });
    if (!reference)
      throw new NotFoundException('Không tìm thấy giao dịch VietQR.');
    const changed = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${reference.orderId}::uuid FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
          include: {
            order: true,
            supportRequest: { select: { status: true } },
          },
        });
        const requestStatus = payment.supportRequest?.status;
        if (requestStatus === 'CONFIRMED' && payment.status === 'SUCCESS')
          return false;
        if (requestStatus !== 'OPEN') {
          throw new ConflictException({
            code: 'PAYMENT_SUPPORT_REQUIRED',
            message: 'Chỉ xác nhận thủ công khi có yêu cầu đối soát đang mở.',
          });
        }
        const [clock] = await tx.$queryRaw<
          Array<{ now: Date }>
        >`SELECT clock_timestamp() AS now`;
        if (
          payment.order.status !== 'PENDING_PAYMENT' ||
          payment.status !== 'PENDING' ||
          (payment.order.reservationExpiresAt?.getTime() ?? 0) <=
            clock.now.getTime()
        ) {
          throw new ConflictException({
            code: 'ORDER_CLOSED',
            message:
              'Đơn đã đóng hoặc hết thời gian giữ hàng. Hãy phản hồi khách về khoản chuyển.',
          });
        }
        if (
          payment.currency !== 'VND' ||
          payment.order.currency !== 'VND' ||
          payment.amount.lte(0) ||
          !payment.amount.eq(payment.order.grandTotal) ||
          !readVietQrRecipient(payment.gatewayResponse)
        ) {
          throw new ConflictException(
            'Thông tin giao dịch VietQR của đơn không khớp.',
          );
        }
        await this.confirmOrder(
          tx,
          payment,
          clock.now,
          actorId,
          'Admin xác nhận đã nhận tiền qua VietQR',
        );
        return true;
      },
      { timeout: 12_000 },
    );
    if (changed) await this.changes.publishOrder(reference.orderId);
    return { confirmed: true };
  }

  record(transfer: IncomingTransfer, expectedPaymentId?: string) {
    return this.recordTransfer(transfer, { expectedPaymentId });
  }

  private async recordTransfer(
    transfer: IncomingTransfer,
    {
      expectedPaymentId,
      simulated = false,
    }: { expectedPaymentId?: string; simulated?: boolean },
  ) {
    const reference = await this.prisma.payment.findFirst({
      where: {
        id: expectedPaymentId,
        transactionRef: transfer.transferCode,
        method: 'BANK_TRANSFER',
      },
      select: { id: true, orderId: true },
    });
    if (!reference) {
      if (expectedPaymentId)
        throw new NotFoundException(
          'Nội dung chuyển khoản không khớp giao dịch VietQR.',
        );
      return { applied: false, duplicate: false, issue: null };
    }

    const settle = (holdExpired = false) =>
      this.prisma.$transaction(
        async (tx) => {
          // Cùng thứ tự khóa với hủy đơn và thu hồi giữ chỗ.
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${reference.orderId}::uuid FOR UPDATE`;
          const payment = await tx.payment.findUniqueOrThrow({
            where: { id: reference.id },
            include: {
              order: { include: { reservations: paymentReservationStart } },
              supportRequest: { select: { status: true } },
            },
          });
          if (expectedPaymentId && payment.supportRequest?.status !== 'OPEN') {
            throw new ConflictException({
              code: 'PAYMENT_SUPPORT_REQUIRED',
              message:
                'Chỉ xác nhận thủ công khi đơn có yêu cầu đối soát đang mở.',
            });
          }
          if (simulated) {
            if (
              payment.status === 'SUCCESS' &&
              wasSePaySimulated(payment.gatewayResponse)
            ) {
              return { applied: false, duplicate: true, issue: null };
            }
            if (
              payment.supportRequest?.status === 'OPEN' ||
              (await tx.bankTransferReceipt.findFirst({
                where: { paymentId: payment.id, issue: { not: null } },
                select: { id: true },
              }))
            ) {
              throw new ConflictException(
                'Đơn có giao dịch đang cần đối soát.',
              );
            }
          }
          const recipient = readVietQrRecipient(payment.gatewayResponse);
          if (
            !recipient ||
            (!expectedPaymentId &&
              (transfer.bankBin !== recipient.bankBin ||
                transfer.accountNumber !== recipient.accountNumber ||
                (recipient.virtualAccount !== undefined &&
                  transfer.virtualAccount !== recipient.virtualAccount)))
          ) {
            if (expectedPaymentId)
              throw new NotFoundException(
                'Không tìm thấy tài khoản nhận tiền của giao dịch.',
              );
            return { applied: false, duplicate: false, issue: null };
          }

          const { order } = payment;
          const [clock] = await tx.$queryRaw<
            Array<{ now: Date }>
          >`SELECT clock_timestamp() AS now`;
          const now = clock.now;
          const paidAt = transfer.receivedAt.getTime();
          const expires = order.reservationExpiresAt?.getTime() ?? 0;
          let issue: ReceiptIssue | null = null;
          if (payment.status === 'SUCCESS') issue = 'ALREADY_PAID';
          else if (
            order.status !== 'PENDING_PAYMENT' ||
            payment.status !== 'PENDING'
          )
            issue = 'ORDER_CLOSED';
          else if (
            holdExpired ||
            expires <= now.getTime() ||
            paidAt >= expires ||
            paidAt <
              Math.floor(paymentWindowStartsAt(order).getTime() / 1000) *
                1000 ||
            paidAt > now.getTime() + 300_000
          ) {
            issue = 'OUTSIDE_PAYMENT_WINDOW';
          } else if (
            order.currency !== 'VND' ||
            payment.currency !== 'VND' ||
            !payment.amount.eq(transfer.amount) ||
            !payment.amount.eq(order.grandTotal)
          ) {
            issue = 'AMOUNT_MISMATCH';
          }
          if ((expectedPaymentId || simulated) && issue) {
            throw new ConflictException({
              code: issue,
              message:
                issue === 'AMOUNT_MISMATCH'
                  ? 'Số tiền thực nhận phải khớp tổng đơn hàng.'
                  : 'Giao dịch ngoài thời gian giữ hàng hoặc đơn đã đóng. Kiểm tra sao kê để xử lý khoản tiền.',
            });
          }
          const saved = await tx.bankTransferReceipt.createMany({
            data: {
              paymentId: payment.id,
              bankBin: recipient.bankBin,
              accountNumber: recipient.accountNumber,
              bankReference: transfer.bankReference,
              providerId: transfer.providerId,
              receivedAt: transfer.receivedAt,
              amount: transfer.amount,
              actorId: transfer.actorId,
              issue,
            },
            skipDuplicates: true,
          });
          if (!saved.count) {
            if (simulated) {
              throw new ConflictException('Biên nhận DEV TEST đã tồn tại.');
            }
            return { applied: false, duplicate: true, issue: null };
          }

          if (simulated) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                gatewayResponse: {
                  ...recipient,
                  confirmationSource: SEPAY_DEV_CONFIRMATION,
                },
              },
            });
          } else if (transfer.providerId) {
            await tx.payment.update({
              where: { id: payment.id },
              data: { callbackCount: { increment: 1 } },
            });
          }
          if (issue) return { applied: false, duplicate: false, issue };
          await this.confirmOrder(
            tx,
            payment,
            now,
            transfer.actorId,
            simulated
              ? 'Thanh toán giả lập SePay (DEV TEST)'
              : expectedPaymentId
                ? 'Admin đã đối chiếu sao kê VietQR theo yêu cầu của khách'
                : 'Đã xác nhận chuyển khoản VietQR từ giao dịch ngân hàng',
          );
          return { applied: true, duplicate: false, issue: null };
        },
        { timeout: 12_000 },
      );

    const result = await settle().catch((error: unknown) => {
      // Giữ chỗ có thể hết hạn trong lúc chờ khóa tồn kho. Ghi nhận khoản tiền để đối soát.
      if (error instanceof ReservationExpiredException) return settle(true);
      throw error;
    });
    if (result.applied) await this.changes.publishOrder(reference.orderId);
    return result;
  }

  private async confirmOrder(
    tx: Prisma.TransactionClient,
    {
      id: paymentId,
      order,
    }: { id: string; order: { id: string; userId: string; orderCode: string } },
    now: Date,
    actorId: string | undefined,
    reason: string,
  ) {
    await this.stock.commitForOrder(tx, order.id, actorId ?? null);
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'SUCCESS', processedAt: now },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED', confirmedAt: now },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: 'PENDING_PAYMENT',
        toStatus: 'CONFIRMED',
        actorId,
        reason,
      },
    });
    await tx.paymentSupportRequest.updateMany({
      where: { paymentId, status: 'OPEN' },
      data: { status: 'CONFIRMED', resolvedAt: now, resolvedById: actorId },
    });
    await recordCustomerOrderNotice(tx, order, 'CONFIRMED');
  }
}
