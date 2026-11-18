import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import {
  CategoriesService,
  type PublicCategory,
} from '../categories/categories.service';
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
export function toCatalogProduct(
  product: CatalogProduct,
  category?: PublicCategory,
) {
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
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    stockByWarehouse,
    availableStock,
    isAvailable: availableStock > 0,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryService: CategoriesService,
  ) {}

  async findAll(query: ProductQueryDto) {
    const categoryFilter = query.category?.trim();
    const search = query.search?.trim();
    const { page, pageSize } = query;
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === 'default'
        ? [{ createdAt: 'desc' }, { id: 'asc' }]
        : [
            { basePrice: query.sort === 'price-asc' ? 'asc' : 'desc' },
            { id: 'asc' },
          ];
    // Đọc cây danh mục, tổng sản phẩm và trang kết quả từ cùng một snapshot.
    return this.prisma.$transaction(
      async (tx) => {
        const categories = await this.categoryService.findAllPublic(tx);
        const publicById = new Map(
          categories.map((category) => [category.id, category]),
        );
        let categoryId: string | undefined;
        if (categoryFilter && categoryFilter !== 'all') {
          categoryId = isUUID(categoryFilter)
            ? publicById.get(categoryFilter.toLowerCase())?.id
            : categories.find((category) => category.slug === categoryFilter)
                ?.id;
          if (!categoryId) {
            return { items: [], total: 0, page, pageSize, totalPages: 0 };
          }
        }

        const where: Prisma.ProductWhereInput = {
          isActive: true,
          ...(categoryId ? { categoryId } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { sku: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        };
        const [total, products] = await Promise.all([
          tx.product.count({ where }),
          tx.product.findMany({
            where,
            select,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
        ]);

        return {
          items: products.map((product) =>
            toCatalogProduct(product, publicById.get(product.categoryId ?? '')),
          ),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findOne(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const product = await tx.product.findFirst({
          where: { id, isActive: true },
          select,
        });
        if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
        const category = product.categoryId
          ? (await this.categoryService.findAllPublic(tx)).find(
              (category) => category.id === product.categoryId,
            )
          : undefined;
        return toCatalogProduct(product, category);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  // Read-only catalog facets; /categories CRUD remains owned by P4.
  async categories() {
    return this.categoryService.findAllPublic();
  }
}
