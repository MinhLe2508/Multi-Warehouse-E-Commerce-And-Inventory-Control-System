import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dto/manage-product.dto';

const fields = {
  id: true,
  sku: true,
  name: true,
  slug: true,
  basePrice: true,
  discountPercent: true,
  categoryId: true,
  imageUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class ManagedProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQueryDto, role: UserRole) {
    const where: Prisma.ProductWhereInput = {
      ...(query.search?.trim()
        ? {
            OR: [
              { name: { contains: query.search.trim(), mode: 'insensitive' } },
              { sku: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.category && query.category !== 'all'
        ? {
            category: isUUID(query.category)
              ? { id: query.category }
              : { slug: query.category },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction(
      [
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          select: { ...fields, costPrice: role === UserRole.ADMIN },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy:
            query.sort === 'default'
              ? [{ createdAt: 'desc' }, { id: 'asc' }]
              : [
                  { basePrice: query.sort === 'price-asc' ? 'asc' : 'desc' },
                  { id: 'asc' },
                ],
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async detail(id: string, role: UserRole) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { ...fields, costPrice: role === UserRole.ADMIN },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    return product;
  }

  private async category(tx: Prisma.TransactionClient, id: string) {
    const category = await tx.category.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!category)
      throw new BadRequestException(
        'Danh mục không tồn tại hoặc đã ngừng hoạt động',
      );
  }

  private fail(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('SKU hoặc slug đã tồn tại');
      if (error.code === 'P2003')
        throw new ConflictException(
          'Sản phẩm hoặc danh mục đang được dữ liệu khác tham chiếu',
        );
      if (error.code === 'P2025')
        throw new NotFoundException('Không tìm thấy sản phẩm');
      if (error.code === 'P2034')
        throw new ConflictException(
          'Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại',
        );
    }
    throw error;
  }

  async create(input: CreateProductDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.category(tx, input.categoryId);
          return tx.product.create({
            data: { ...input, name: input.name.trim() },
            select: { ...fields, costPrice: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.fail(error);
    }
  }

  async update(id: string, input: UpdateProductDto) {
    if (!Object.values(input).some((value) => value !== undefined))
      throw new BadRequestException('Chưa có thông tin cần cập nhật');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (input.categoryId) await this.category(tx, input.categoryId);
          return tx.product.update({
            where: { id },
            data: {
              ...input,
              ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            },
            select: { ...fields, costPrice: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.fail(error);
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Lock parent, then inventory in deterministic order. Do not cascade away audit history.
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
          if (!rows.length)
            throw new NotFoundException('Không tìm thấy sản phẩm');
          await tx.$queryRaw`SELECT id FROM inventory WHERE product_id = ${id}::uuid ORDER BY id FOR UPDATE`;
          const orders = await tx.orderItem.count({ where: { productId: id } });
          if (orders)
            throw new ConflictException(
              'Sản phẩm đã nằm trong đơn hàng. Hãy ngừng bán thay vì xóa',
            );
          const protectedInventory = await tx.inventory.count({
            where: {
              productId: id,
              OR: [
                { stock: { gt: 0 } },
                { reservedStock: { gt: 0 } },
                { auditLogs: { some: {} } },
                { reservations: { some: {} } },
                { alerts: { some: {} } },
              ],
            },
          });
          if (protectedInventory)
            throw new ConflictException(
              'Sản phẩm còn tồn kho, giữ chỗ hoặc lịch sử kho. Hãy ngừng bán thay vì xóa',
            );
          await tx.product.delete({ where: { id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.fail(error);
    }
  }
}
