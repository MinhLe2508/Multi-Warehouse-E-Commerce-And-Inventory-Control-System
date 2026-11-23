import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePromotionDto, PromotionQueryDto } from './promotions.dto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const categorySelect = { id: true, name: true } as const;
const promotionSelect = {
  id: true,
  code: true,
  name: true,
  percent: true,
  allCategories: true,
  expiresAt: true,
  createdAt: true,
  categories: { select: { category: { select: categorySelect } } },
} satisfies Prisma.PromotionSelect;

type PromotionRow = Prisma.PromotionGetPayload<{
  select: typeof promotionSelect;
}>;

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PromotionQueryDto) {
    const now = new Date();
    const search = query.search?.trim();
    const where: Prisma.PromotionWhereInput = {
      deletedAt: null,
      ...(query.status && {
        expiresAt: query.status === 'ACTIVE' ? { gt: now } : { lte: now },
      }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.promotion.findMany({
          where,
          select: promotionSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.promotion.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: rows.map((row) => this.serialize(row, now)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async create(dto: CreatePromotionDto) {
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date())
      throw new BadRequestException('Hạn sử dụng phải ở tương lai.');
    if (dto.allCategories === dto.categoryIds.length > 0) {
      throw new BadRequestException(
        'Chọn tất cả mặt hàng hoặc ít nhất một danh mục.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        if (dto.categoryIds.length) {
          const count = await tx.category.count({
            where: { id: { in: dto.categoryIds }, isActive: true },
          });
          if (count !== dto.categoryIds.length)
            throw new BadRequestException('Có danh mục không còn khả dụng.');
        }
        let created: { id: string; code: string } | undefined;
        for (let attempt = 0; attempt < 8 && !created; attempt++) {
          const code = Array.from(
            { length: 5 },
            () => ALPHABET[randomInt(ALPHABET.length)],
          ).join('');
          [created] = await tx.promotion.createManyAndReturn({
            data: {
              code,
              name: dto.name,
              percent: dto.percent,
              expiresAt,
              allCategories: dto.allCategories,
            },
            select: { id: true, code: true },
            skipDuplicates: true,
          });
        }
        if (!created)
          throw new ConflictException(
            'Chưa tạo được mã khuyến mãi. Vui lòng thử lại.',
          );
        const promotionId = created.id;
        if (dto.categoryIds.length) {
          await tx.promotionCategory.createMany({
            data: dto.categoryIds.map((categoryId) => ({
              categoryId,
              promotionId,
            })),
          });
        }
        const body = `${dto.name} · Giảm ${dto.percent}% · Mã ${created.code}`;
        await tx.$executeRaw`
        INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
        SELECT id, 'PROMOTION'::"NotificationType", 'Khuyến mãi mới', ${body}, 'Promotion', ${promotionId}
        FROM users WHERE is_active AND role IN ('CUSTOMER', 'WAREHOUSE_STAFF')
      `;
        return this.serialize(
          await tx.promotion.findUniqueOrThrow({
            where: { id: promotionId },
            select: promotionSelect,
          }),
          new Date(),
        );
      },
      { timeout: 15_000 },
    );
  }

  async remove(id: string) {
    const row = await this.prisma.promotion.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!row.count) throw new NotFoundException('Không tìm thấy khuyến mãi.');
    return { removed: true };
  }

  async available(userId: string) {
    const now = new Date();
    const rows = await this.prisma.promotion.findMany({
      where: { deletedAt: null, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      select: {
        ...promotionSelect,
        claims: { where: { userId }, select: { createdAt: true }, take: 1 },
      },
    });
    return rows.map(({ claims, ...row }) => ({
      ...this.serialize(row, now),
      claimed: claims.length > 0,
    }));
  }

  async claim(userId: string, promotionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockActive(tx, promotionId);
      await tx.promotionClaim.createMany({
        data: { userId, promotionId },
        skipDuplicates: true,
      });
      return { claimed: true };
    });
  }

  async checkoutScope(
    tx: Prisma.TransactionClient,
    userId: string,
    promotionId: string,
    lock = false,
  ) {
    if (lock) await this.lockActive(tx, promotionId);
    const row = await tx.promotion.findFirst({
      where: {
        id: promotionId,
        deletedAt: null,
        expiresAt: { gt: new Date() },
        claims: { some: { userId } },
      },
      select: {
        id: true,
        code: true,
        percent: true,
        allCategories: true,
        categories: { select: { categoryId: true } },
      },
    });
    if (!row)
      throw new ConflictException({
        code: 'PROMOTION_UNAVAILABLE',
        message:
          'Mã khuyến mãi đã hết hạn hoặc chưa có trong tài khoản của bạn.',
      });
    if (row.allCategories)
      return {
        id: row.id,
        code: row.code,
        percent: row.percent,
        eligibleCategories: null,
      };
    const categories = await tx.category.findMany({
      select: { id: true, parentId: true },
    });
    const children = new Map<string, string[]>();
    for (const { id, parentId } of categories) {
      if (parentId) {
        const branch = children.get(parentId) ?? [];
        branch.push(id);
        children.set(parentId, branch);
      }
    }
    const eligibleCategories = new Set<string>();
    const pending = row.categories.map(({ categoryId }) => categoryId);
    while (pending.length) {
      const current = pending.pop()!;
      if (eligibleCategories.has(current)) continue;
      eligibleCategories.add(current);
      pending.push(...(children.get(current) ?? []));
    }
    return {
      id: row.id,
      code: row.code,
      percent: row.percent,
      eligibleCategories,
    };
  }

  private async lockActive(tx: Prisma.TransactionClient, id: string) {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM promotions
      WHERE id = ${id}::uuid AND deleted_at IS NULL AND expires_at > clock_timestamp()
      FOR SHARE
    `;
    if (!row)
      throw new ConflictException({
        code: 'PROMOTION_UNAVAILABLE',
        message: 'Khuyến mãi đã hết hiệu lực.',
      });
  }

  private serialize({ categories, ...row }: PromotionRow, now: Date) {
    return {
      ...row,
      categories: categories.map(({ category }) => category),
      status: row.expiresAt > now ? ('ACTIVE' as const) : ('EXPIRED' as const),
    };
  }
}
