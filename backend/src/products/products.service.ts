import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { ProductQueryDto } from './dto/product-query.dto';

const select = {
  id: true,
  sku: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  discountPercent: true,
  imageUrl: true,
  categoryId: true,
  category: { select: { name: true, isActive: true } },
  inventory: {
    where: { warehouse: { isActive: true } },
    select: {
      warehouseId: true,
      availableStock: true,
      warehouse: { select: { name: true } },
    },
    orderBy: { warehouseId: 'asc' as const },
  },
} satisfies Prisma.ProductSelect;

type CatalogProduct = Prisma.ProductGetPayload<{ select: typeof select }>;

// Explicit public response: never serialize the entire Prisma graph or BigInt IDs.
export function toCatalogProduct(product: CatalogProduct) {
  const stockByWarehouse = product.inventory.map((row) => ({
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse.name,
    quantity: Math.max(0, row.availableStock),
  }));
  const availableStock = stockByWarehouse.reduce(
    (sum, row) => sum + row.quantity,
    0,
  );
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    description: product.description ?? '',
    basePrice: product.basePrice.toFixed(2),
    discountPercent: product.discountPercent.toFixed(2),
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    categoryName: product.category?.isActive ? product.category.name : null,
    stockByWarehouse,
    availableStock,
    isAvailable: availableStock > 0,
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ProductQueryDto) {
    const category = query.category?.trim();
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category && category !== 'all'
        ? {
            category: {
              isActive: true,
              ...(isUUID(category) ? { id: category } : { slug: category }),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === 'default'
        ? [{ createdAt: 'desc' }, { id: 'asc' }]
        : [
            { basePrice: query.sort === 'price-asc' ? 'asc' : 'desc' },
            { id: 'asc' },
          ];
    // Count and page share one snapshot even if another member edits the catalog.
    const [total, products] = await this.prisma.$transaction(
      [
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          select,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: products.map(toCatalogProduct),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      select,
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    return toCatalogProduct(product);
  }

  // Read-only catalog facets; /categories CRUD remains owned by P4.
  async categories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, parentId: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
}
