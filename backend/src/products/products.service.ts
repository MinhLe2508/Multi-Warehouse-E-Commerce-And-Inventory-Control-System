import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  const salePrice = product.basePrice.minus(
    product.basePrice
      .times(product.discountPercent)
      .div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  );
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
    salePrice: salePrice.toFixed(2),
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
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException(
        'Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa.',
      );
    }
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === 'name-asc'
        ? [{ name: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'asc' }];
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
          ...(query.onSale ? { discountPercent: { gt: 0 } } : {}),
          ...(query.inStock
            ? {
                inventory: {
                  some: {
                    availableStock: { gt: 0 },
                    warehouse: { isActive: true },
                  },
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
        const usesSalePrice =
          query.minPrice !== undefined ||
          query.maxPrice !== undefined ||
          query.sort === 'price-asc' ||
          query.sort === 'price-desc';
        const [total, products] = usesSalePrice
          ? await this.pageBySalePrice(tx, query, categoryId, search)
          : await Promise.all([
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

  private async pageBySalePrice(
    tx: Prisma.TransactionClient,
    query: ProductQueryDto,
    categoryId?: string,
    search?: string,
  ): Promise<[number, CatalogProduct[]]> {
    const price = Prisma.sql`p.base_price - round(p.base_price * p.discount_percent / 100, 2)`;
    const criteria = Prisma.sql`
      FROM products p
      WHERE p.is_active
        ${categoryId ? Prisma.sql`AND p.category_id = ${categoryId}::uuid` : Prisma.empty}
        ${search ? Prisma.sql`AND (p.name ILIKE ${'%' + search + '%'} OR p.sku ILIKE ${'%' + search + '%'})` : Prisma.empty}
        ${query.onSale ? Prisma.sql`AND p.discount_percent > 0` : Prisma.empty}
        ${
          query.inStock
            ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id
          WHERE i.product_id = p.id AND w.is_active AND i.available_stock > 0
        )`
            : Prisma.empty
        }
        ${query.minPrice !== undefined ? Prisma.sql`AND (${price}) >= ${query.minPrice}::numeric` : Prisma.empty}
        ${query.maxPrice !== undefined ? Prisma.sql`AND (${price}) <= ${query.maxPrice}::numeric` : Prisma.empty}
    `;
    const order =
      query.sort === 'price-asc'
        ? Prisma.sql`(${price}) ASC`
        : query.sort === 'price-desc'
          ? Prisma.sql`(${price}) DESC`
          : query.sort === 'name-asc'
            ? Prisma.sql`p.name ASC`
            : Prisma.sql`p.created_at DESC`;
    const [totals, ids] = await Promise.all([
      tx.$queryRaw<
        Array<{ total: number }>
      >`SELECT count(*)::int AS total ${criteria}`,
      tx.$queryRaw<Array<{ id: string }>>`
        SELECT p.id ${criteria}
        ORDER BY ${order}, p.id ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      `,
    ]);
    const rows = ids.length
      ? await tx.product.findMany({
          where: { id: { in: ids.map(({ id }) => id) } },
          select,
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    return [totals[0]?.total ?? 0, ids.flatMap(({ id }) => byId.get(id) ?? [])];
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
