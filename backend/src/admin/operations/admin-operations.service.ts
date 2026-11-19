import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatRole, Prisma, UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminPageQuery,
  ChatListQuery,
  CustomerListQuery,
  InventoryAuditListQuery,
  KnowledgeListQuery,
  PaymentListQuery,
  ReservationListQuery,
} from './admin-list.dto';

const orderIdentity = { id: true, orderCode: true } as const;
const inventoryIdentity = {
  id: true,
  product: { select: { name: true, sku: true } },
  warehouse: { select: { id: true, code: true, name: true } },
} satisfies Prisma.InventorySelect;
const customerSelect = {
  id: true,
  fullName: true,
  username: true,
  email: true,
  phone: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

const contains = (text: string) => ({
  contains: text,
  mode: Prisma.QueryMode.insensitive,
});

@Injectable()
export class AdminOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async readPage<Row>(
    query: AdminPageQuery,
    rows: Prisma.PrismaPromise<Row[]>,
    count: Prisma.PrismaPromise<number>,
  ) {
    const [items, total] = await this.prisma.$transaction([rows, count], {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  private pagination({ page, limit }: AdminPageQuery) {
    return { skip: (page - 1) * limit, take: limit };
  }

  async listPayments(query: PaymentListQuery) {
    const filter = query.search && contains(query.search);
    const where: Prisma.PaymentWhereInput = {
      status: query.status,
      method: query.method,
      ...(filter && {
        OR: [{ transactionRef: filter }, { order: { orderCode: filter } }],
      }),
    };
    const page = await this.readPage(
      query,
      this.prisma.payment.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          transactionRef: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          failureReason: true,
          callbackCount: true,
          createdAt: true,
          processedAt: true,
          order: { select: orderIdentity },
        },
      }),
      this.prisma.payment.count({ where }),
    );
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row,
        amount: row.amount.toFixed(2),
      })),
    };
  }

  async listReservations(query: ReservationListQuery) {
    const filter = query.search && contains(query.search);
    const where: Prisma.StockReservationWhereInput = {
      status: query.status,
      inventory: query.warehouseId
        ? { warehouseId: query.warehouseId }
        : undefined,
      ...(filter && {
        OR: [
          { order: { orderCode: filter } },
          { inventory: { product: { sku: filter } } },
          { inventory: { product: { name: filter } } },
        ],
      }),
    };
    const page = await this.readPage(
      query,
      this.prisma.stockReservation.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          quantity: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          committedAt: true,
          releasedAt: true,
          order: { select: orderIdentity },
          inventory: { select: inventoryIdentity },
        },
      }),
      this.prisma.stockReservation.count({ where }),
    );
    return {
      ...page,
      items: page.items.map(({ id, inventory, ...row }) => ({
        ...row,
        id: id.toString(),
        inventory: { ...inventory, id: inventory.id.toString() },
      })),
    };
  }

  async listInventoryAudit(query: InventoryAuditListQuery) {
    const filter = query.search && contains(query.search);
    const where: Prisma.InventoryAuditLogWhereInput = {
      reason: query.reason,
      inventory: query.warehouseId
        ? { warehouseId: query.warehouseId }
        : undefined,
      ...(filter && {
        OR: [
          { referenceId: filter },
          { inventory: { product: { sku: filter } } },
          { inventory: { product: { name: filter } } },
        ],
      }),
    };
    const page = await this.readPage(
      query,
      this.prisma.inventoryAuditLog.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          reason: true,
          createdAt: true,
          stockBefore: true,
          stockAfter: true,
          reservedBefore: true,
          reservedAfter: true,
          quantityDelta: true,
          referenceType: true,
          referenceId: true,
          note: true,
          actor: { select: { fullName: true } },
          inventory: { select: inventoryIdentity },
        },
      }),
      this.prisma.inventoryAuditLog.count({ where }),
    );
    return {
      ...page,
      items: page.items.map(({ id, inventory, ...row }) => ({
        ...row,
        id: id.toString(),
        inventory: { ...inventory, id: inventory.id.toString() },
      })),
    };
  }

  async listCustomers(query: CustomerListQuery) {
    const filter = query.search && contains(query.search);
    const where: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      isActive: query.status ? query.status !== 'LOCKED' : undefined,
      ...(query.status === 'ACTIVE' && { emailVerifiedAt: { not: null } }),
      ...(query.status === 'PENDING_VERIFICATION' && { emailVerifiedAt: null }),
      ...(filter && {
        OR: [
          { fullName: filter },
          { username: filter },
          { email: filter },
          { phone: filter },
        ],
      }),
    };
    const page = await this.readPage(
      query,
      this.prisma.user.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: customerSelect,
      }),
      this.prisma.user.count({ where }),
    );
    return {
      ...page,
      items: page.items.map(({ _count, ...row }) => ({
        ...row,
        orderCount: _count.orders,
      })),
    };
  }

  async getCustomerOrders(id: string, query: AdminPageQuery) {
    const customer = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng.');
    const where = { userId: id };
    const page = await this.readPage(
      query,
      this.prisma.order.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          ...orderIdentity,
          status: true,
          grandTotal: true,
          createdAt: true,
        },
      }),
      this.prisma.order.count({ where }),
    );
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row,
        grandTotal: row.grandTotal.toFixed(2),
      })),
    };
  }

  listChats(query: ChatListQuery) {
    const filter = query.search && contains(query.search);
    const where: Prisma.ChatSessionWhereInput = {
      escalatedToHuman: query.handling
        ? query.handling === 'ESCALATED'
        : undefined,
      ...(filter && {
        OR: [
          ...(query.search && isUUID(query.search)
            ? [{ id: query.search }]
            : []),
          { user: { fullName: filter } },
          { user: { username: filter } },
        ],
      }),
    };
    return this.readPage(
      query,
      this.prisma.chatSession.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          messageCount: true,
          escalatedToHuman: true,
          startedAt: true,
          user: { select: { fullName: true, username: true } },
        },
      }),
      this.prisma.chatSession.count({ where }),
    );
  }

  async getChatMessages(id: string, query: AdminPageQuery) {
    const chat = await this.prisma.chatSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!chat) throw new NotFoundException('Không tìm thấy phiên hội thoại.');
    const where = {
      sessionId: id,
      role: { in: [ChatRole.USER, ChatRole.ASSISTANT] },
    };
    const page = await this.readPage(
      query,
      this.prisma.chatMessage.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
          isFallback: true,
        },
      }),
      this.prisma.chatMessage.count({ where }),
    );
    return {
      ...page,
      items: page.items.map((row) => ({ ...row, id: row.id.toString() })),
    };
  }

  async listKnowledge(query: KnowledgeListQuery) {
    const filter = query.search && contains(query.search);
    const where: Prisma.KbDocumentWhereInput = {
      isActive: query.status ? query.status === 'ACTIVE' : undefined,
      ...(filter && {
        OR: [{ title: filter }, { docType: filter }],
      }),
    };
    const page = await this.readPage(
      query,
      this.prisma.kbDocument.findMany({
        where,
        ...this.pagination(query),
        orderBy: [{ updatedAt: 'desc' }, { chunkIndex: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          docType: true,
          chunkIndex: true,
          content: true,
          isActive: true,
          sourceUrl: true,
          updatedAt: true,
        },
      }),
      this.prisma.kbDocument.count({ where }),
    );
    if (page.items.length === 0) return { ...page, items: [] };
    const ids = page.items.map(({ id }) => id);
    const indexed = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM kb_documents WHERE id = ANY(${ids}::uuid[]) AND embedding IS NOT NULL
    `;
    const indexedIds = new Set(indexed.map(({ id }) => id));
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row,
        hasEmbedding: indexedIds.has(row.id),
      })),
    };
  }
}
