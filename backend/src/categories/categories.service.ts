// =============================================================================
// Nghiệp vụ quản lý DANH MỤC SẢN PHẨM dạng cây xem công khai cho Storefront, xem quản trị cho Admin, tạo, sửa (kể cả chuyển nhánh) và xóa danh mục.
//
// NGUYÊN TẮC THIẾT KẾ:
// 1. HAI GÓC NHÌN DỮ LIỆU:
//    - Công khai (Storefront): chỉ id, name, slug, parentId (hoặc dạng cây), và
//      chỉ những danh mục ĐANG HIỂN THỊ. Một danh mục chỉ hiển thị khi chính nó
//      VÀ mọi danh mục tổ tiên của nó đều đang hiển thị (con của danh mục bị
//      ẩn thì không truy cập được).
//    - Quản trị (Admin): đầy đủ, kể cả danh mục bị ẩn, kèm thời điểm tạo/sửa và
//      số sản phẩm / số danh mục con (để giao diện biết danh mục có xóa được
//      không).
// 2. CHỐNG VÒNG LẶP CÂY: không cho đặt danh mục làm con của chính nó hoặc của
//    danh mục con cháu của nó. Mọi thao tác làm thay đổi cấu trúc cây (tạo, sửa,
//    xóa) chạy trong transaction và lấy một KHÓA TƯ VẤN (advisory lock) chung
//    để tuần tự hóa, nên 2 Admin chuyển nhánh đồng thời không thể tạo vòng lặp.
// 3. XÓA CỨNG nhưng CÓ CHẶN: chỉ xóa được danh mục không còn sản phẩm và không
//    còn danh mục con (nếu không sẽ làm sản phẩm mất danh mục, trái yêu cầu
//    "sản phẩm phải thuộc một danh mục của hệ thống"). Muốn tạm gỡ khỏi
//    Storefront mà vẫn giữ dữ liệu thì ẩn danh mục (isActive = false).
// 4. SLUG ỔN ĐỊNH: tự sinh từ tên khi tạo (nếu Admin không nhập), nhưng đổi tên
//    không làm đổi slug (tránh hỏng URL cũ).
// 5. Số lượng danh mục rất nhỏ (vài chục) nên tải toàn bộ cây vào bộ nhớ để
//    tính toán là đơn giản và đủ nhanh.
// 6. Service được EXPORT (xem categories.module.ts): module Products (Trọng)
//    có thể gọi getActiveCategoryOrThrow() để kiểm tra "danh mục phải nằm
//    trong các danh mục của hệ thống" khi Admin tạo/sửa sản phẩm.
// =============================================================================

import { BadRequestException, ConflictException, Injectable, NotFoundException, } from '@nestjs/common';
import { Prisma, type Category } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type CreateCategoryDto } from './dto/create-category.dto';
import { type UpdateCategoryDto } from './dto/update-category.dto';

// ----------------------------------------------------------------------------
// Kiểu dữ liệu trả về
// ----------------------------------------------------------------------------

// Danh mục ở dạng PHẲNG cho Storefront (Client tự dựng cây từ parentId nếu cần).
export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

// Danh mục ở dạng cây lồng nhau cho Storefront (dùng vẽ menu).
export interface PublicCategoryNode {
  id: string;
  name: string;
  slug: string;
  children: PublicCategoryNode[];
}

// Danh mục đầy đủ cho trang quản trị của Admin.
export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Số sản phẩm thuộc trực tiếp danh mục này (kể cả sản phẩm đang ẩn).
  productCount: number;
  // Số danh mục con trực tiếp.
  childCount: number;
}

// ----------------------------------------------------------------------------
// Hằng số
// ----------------------------------------------------------------------------

// Khóa tư vấn (advisory lock) dùng chung cho mọi thao tác thay đổi cấu trúc cây danh mục. 
// Số nguyên bất kỳ nhưng PHẢI cố định và không trùng khóa tư vấn khác trong dự án.
const CATEGORY_TREE_LOCK_KEY = 7300201;

// Độ dài tối đa của slug, khớp @db.VarChar(160) của cột "slug".
const SLUG_MAX_LENGTH = 160;

// Slug dự phòng khi tên chỉ gồm ký tự đặc biệt
const FALLBACK_SLUG = 'danh-muc';

// Số lần thử tối đa khi tự thêm hậu tố "-2", "-3"... để tránh trùng slug.
const MAX_SLUG_ATTEMPTS = 100;

// ----------------------------------------------------------------------------
// Hàm tiện ích thuần (không phụ thuộc CSDL)
// ----------------------------------------------------------------------------


// Chuyển một chuỗi (thường là tên danh mục tiếng Việt) thành slug.
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // 1. Truy vấn công khai (Storefront — không cần đăng nhập)
  // ==========================================================================

  // Danh sách PHẲNG các danh mục đang hiển thị, sắp xếp theo tên 
  async findAllPublic(): Promise<PublicCategory[]> {
    const all = await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        isActive: true,
      },
    });

    return this.visibleCategories(all);
  }

  // Danh sách các danh mục đang hiển thị dạng CÂY LỒNG NHAU: mỗi danh mục có mảng "children". Danh mục gốc nằm ở mảng kết quả ngoài cùng.
  async findTreePublic(): Promise<PublicCategoryNode[]> {
    const visible = await this.findAllPublic();

    const nodes = new Map<string, PublicCategoryNode>();
    for (const category of visible) {
      nodes.set(category.id, {
        id: category.id,
        name: category.name,
        slug: category.slug,
        children: [],
      });
    }

    const roots: PublicCategoryNode[] = [];
    for (const category of visible) {
      const node = nodes.get(category.id)!;
      const parent = category.parentId ? nodes.get(category.parentId) : undefined;

      // Danh mục hiển thị thì tổ tiên của nó chắc chắn hiển thị (xem visibleCategories), nên "parent" luôn tìm thấy khi parentId khác null.
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  // ==========================================================================
  // 2. TRUY VẤN QUẢN TRỊ (chỉ Admin)
  // ==========================================================================

  // Danh sách đầy đủ MỌI danh mục (kể cả đang ẩn) cho trang quản trị, kèm số sản phẩm và số danh mục con. Sắp xếp theo tên
  async findAllForAdmin(): Promise<AdminCategory[]> {
    const rows = await this.prisma.category.findMany({
      include: { _count: { select: { products: true, children: true } } },
      orderBy: { name: 'asc' },
    });

    return rows.map((row) => this.toAdminCategory(row));
  }

  // Chi tiết một danh mục cho Admin (HTTP 404 nếu không tồn tại).
  async findOneForAdmin(id: string): Promise<AdminCategory> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });

    if (!row) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }

    return this.toAdminCategory(row);
  }

  // Dành cho module khác (ví dụ Products của Trọng): lấy danh mục ĐANG HIỂN THỊ hoặc ném HTTP 404 nếu không tồn tại / đang bị ẩn
  // Dùng để kiểm tra "danh mục của sản phẩm phải nằm trong các danh mục của hệ thống"
  async getActiveCategoryOrThrow(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Category> {
    const category = await client.category.findUnique({ where: { id } });

    if (!category || !category.isActive) {
      throw new NotFoundException(
        'Danh mục không tồn tại hoặc đang bị ẩn.',
      );
    }

    return category;
  }

  // ==========================================================================
  // 3. TẠO MỚI
  // ==========================================================================

  /**
   * Tạo danh mục mới (luôn ở trạng thái hiển thị).
   *
   * Luồng xử lý (toàn bộ trong 1 transaction, đã khóa cấu trúc cây):
   * 1. Nếu có danh mục cha: cha phải tồn tại.
   * 2. Tên không được trùng với danh mục anh em cùng cha (không phân biệt hoa thường).
   * 3. Slug: Admin nhập thì phải chưa tồn tại; không nhập thì tự sinh từ tên.
   */
  async create(input: CreateCategoryDto): Promise<Category> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTree(tx);

        const parentId = input.parentId ?? null;

        if (parentId !== null) {
          const parent = await tx.category.findUnique({
            where: { id: parentId },
            select: { id: true },
          });
          if (!parent) {
            throw new BadRequestException('Danh mục cha không tồn tại.');
          }
        }

        await this.assertSiblingNameAvailable(tx, parentId, input.name);

        let slug: string;
        if (input.slug) {
          await this.assertSlugAvailable(tx, input.slug);
          slug = input.slug;
        } else {
          slug = await this.generateUniqueSlug(tx, input.name);
        }

        return tx.category.create({
          data: { name: input.name, slug, parentId },
        });
      });
    } catch (error: unknown) {
      throw this.mapUniqueViolation(error);
    }
  }

  // ==========================================================================
  // 4. CẬP NHẬT
  // ==========================================================================

  /**
   * Cập nhật từng phần danh mục (chỉ các trường được gửi mới bị đổi), kể cả
   * chuyển sang danh mục cha khác và ẩn / hiện.
   *
   * Các kiểm tra (trong 1 transaction, đã khóa cấu trúc cây):
   * - Danh mục phải tồn tại (404).
   * - Chuyển nhánh: cha mới phải tồn tại; không được là chính nó (400); không được là danh mục con cháu của nó vì sẽ tạo vòng lặp (409).
   * - Slug mới phải chưa được danh mục khác dùng (409).
   * - Đổi tên hoặc đổi cha: tên không được trùng danh mục anh em ở vị trí mới (409).
   */
  async update(id: string, input: UpdateCategoryDto): Promise<Category> {
    const data = this.buildUpdateData(input);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTree(tx);

        const current = await tx.category.findUnique({ where: { id } });
        if (!current) {
          throw new NotFoundException('Không tìm thấy danh mục.');
        }

        const isMoving =
          input.parentId !== undefined && input.parentId !== current.parentId;

        if (isMoving && input.parentId !== null && input.parentId !== undefined) {
          await this.assertValidNewParent(tx, id, input.parentId);
        }

        if (input.slug !== undefined && input.slug !== current.slug) {
          await this.assertSlugAvailable(tx, input.slug, id);
        }

        const isRenaming = input.name !== undefined && input.name !== current.name;
        if (isRenaming || isMoving) {
          const targetParentId =
            input.parentId !== undefined ? input.parentId : current.parentId;
          await this.assertSiblingNameAvailable(
            tx,
            targetParentId,
            input.name ?? current.name,
            id,
          );
        }

        return tx.category.update({ where: { id }, data });
      });
    } catch (error: unknown) {
      throw this.mapUniqueViolation(error);
    }
  }

  // ==========================================================================
  // 5. XÓA
  // ==========================================================================

  /**
   * Xóa CỨNG một danh mục — chỉ khi không còn sản phẩm và không còn danh mục con.
   *
   * Ngoài khóa cấu trúc cây, hàm còn khóa chính dòng danh mục (FOR UPDATE) TRƯỚC
   * khi đếm sản phẩm: một sản phẩm đang được thêm vào danh mục này cùng lúc sẽ
   * phải chờ, rồi gặp lỗi khóa ngoại (danh mục đã bị xóa) thay vì âm thầm bị
   * mất danh mục (khóa ngoại Product.category dùng SetNull).
   */
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockTree(tx);
      await this.lockCategoryRow(tx, id);

      const productCount = await tx.product.count({ where: { categoryId: id } });
      if (productCount > 0) {
        throw new ConflictException(
          `Không thể xóa danh mục vì còn ${productCount} sản phẩm thuộc danh mục này. Hãy chuyển các sản phẩm sang danh mục khác, hoặc ẩn danh mục thay vì xóa.`,
        );
      }

      const childCount = await tx.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new ConflictException(
          `Không thể xóa danh mục vì còn ${childCount} danh mục con. Hãy xóa hoặc chuyển các danh mục con trước.`,
        );
      }

      await tx.category.delete({ where: { id } });
    });
  }

  // ==========================================================================
  // 6. HÀM NỘI BỘ — DỮ LIỆU
  // ==========================================================================

  /**
   * Lấy khóa tư vấn (advisory lock) cấp transaction cho cấu trúc cây danh mục:
   * mọi thao tác tạo/sửa/xóa danh mục xếp hàng tuần tự, nên các kiểm tra "cha
   * tồn tại", "không tạo vòng lặp", "tên không trùng" không bị đọc dữ liệu cũ.
   * Khóa tự nhả khi transaction kết thúc (commit hoặc rollback).
   *
   * Dùng $executeRaw (không dùng $queryRaw) vì hàm pg_advisory_xact_lock trả về
   * kiểu "void" mà Prisma không đọc được trong kết quả truy vấn.
   */
  private async lockTree(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATEGORY_TREE_LOCK_KEY}::bigint)`;
  }

  /**
   * Khóa dòng danh mục (FOR UPDATE) và kiểm tra danh mục tồn tại (HTTP 404).
   * Dùng $queryRaw dạng tagged template chống SQL injection; id đã được
   * ParseUUIDPipe kiểm tra ở Controller.
   */
  private async lockCategoryRow(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "categories" WHERE "id" = ${id}::uuid FOR UPDATE
    `;

    if (rows.length !== 1) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }
  }

  /**
   * Chuyển DTO thành dữ liệu cập nhật Prisma, CHỈ gồm các trường được gửi.
   * Phân biệt undefined (không đổi) với null (parentId = null nghĩa là chuyển thành danh mục gốc).
   */
  private buildUpdateData(
    input: UpdateCategoryDto,
  ): Prisma.CategoryUncheckedUpdateInput {
    const data: Prisma.CategoryUncheckedUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.parentId !== undefined) data.parentId = input.parentId;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return data;
  }

  // Chuyển bản ghi Prisma (kèm _count) thành dạng trả về cho Admin.
  private toAdminCategory(row: {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: { products: number; children: number };
  }): AdminCategory {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      productCount: row._count.products,
      childCount: row._count.children,
    };
  }

  /**
   * Từ các danh mục tải từ CSDL, giữ lại những danh mục ĐANG HIỂN THỊ THỰC SỰ:
   * chính nó và mọi tổ tiên đều có isActive = true. Kết quả sắp xếp theo tên
   * (thứ tự chữ cái tiếng Việt) và chỉ gồm các trường công khai.
   *
   * Cách tính duyệt ngược từ mỗi danh mục lên gốc (không đệ quy, có ghi nhớ kết
   * quả đã tính); có chốt chặn vòng lặp chỉ để phòng dữ liệu hỏng, vì các thao
   * tác trong service này không bao giờ tạo vòng lặp.
   */
  private visibleCategories(
    all: Array<{
      id: string;
      name: string;
      slug: string;
      parentId: string | null;
      isActive: boolean;
    }>,
  ): PublicCategory[] {
    const byId = new Map(all.map((category) => [category.id, category]));
    const visibility = new Map<string, boolean>();

    const isVisible = (startId: string): boolean => {
      const path: string[] = [];
      let result = true;
      let cursorId: string | null = startId;

      while (cursorId !== null) {
        const known = visibility.get(cursorId);
        if (known !== undefined) {
          result = known;
          break;
        }

        const cursor = byId.get(cursorId);
        if (!cursor || path.includes(cursorId)) {
          result = false;
          break;
        }

        path.push(cursorId);

        if (!cursor.isActive) {
          result = false;
          break;
        }

        cursorId = cursor.parentId;
      }

      // Mọi danh mục trên đường đi đều hiển thị khi gặp gốc hoặc một tổ tiên đã
      // biết là hiển thị; ngược lại tất cả đều không hiển thị (chúng là chính danh mục bị ẩn hoặc nằm dưới danh mục bị ẩn).
      for (const pathId of path) {
        visibility.set(pathId, result);
      }

      return result;
    };

    const collator = new Intl.Collator('vi');

    return all
      .filter((category) => isVisible(category.id))
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
      }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }

  // ==========================================================================
  // 7. HÀM NỘI BỘ — KIỂM TRA NGHIỆP VỤ
  // ==========================================================================

  /**
   * Kiểm tra danh mục cha mới hợp lệ khi chuyển nhánh:
   * - không phải chính danh mục đang sửa (HTTP 400);
   * - tồn tại (HTTP 400);
   * - không phải danh mục con cháu của danh mục đang sửa (HTTP 409) — nếu là
   *   con cháu thì chuyển vào sẽ tạo vòng lặp.
   */
  private async assertValidNewParent(
    tx: Prisma.TransactionClient,
    id: string,
    newParentId: string,
  ): Promise<void> {
    if (newParentId === id) {
      throw new BadRequestException(
        'Danh mục không thể là danh mục cha của chính nó.',
      );
    }

    const all = await tx.category.findMany({
      select: { id: true, parentId: true },
    });
    const parentOf = new Map(all.map((category) => [category.id, category.parentId]));

    if (!parentOf.has(newParentId)) {
      throw new BadRequestException('Danh mục cha không tồn tại.');
    }

    // Đi ngược từ cha mới lên gốc; nếu gặp chính danh mục đang sửa nghĩa là cha mới nằm trong nhánh con cháu của nó. 
    // "visited" chặn vòng lặp vô hạn nếu dữ liệu đã hỏng từ trước.
    const visited = new Set<string>();
    let cursorId: string | null = newParentId;

    while (cursorId !== null && !visited.has(cursorId)) {
      if (cursorId === id) {
        throw new ConflictException(
          'Không thể chuyển danh mục vào chính danh mục con cháu của nó (tạo vòng lặp).',
        );
      }
      visited.add(cursorId);
      cursorId = parentOf.get(cursorId) ?? null;
    }
  }

  /**
   * Kiểm tra tên chưa bị danh mục ANH EM (cùng danh mục cha, hoặc cùng là danh mục gốc khi parentId = null) dùng — không phân biệt hoa thường. 
   * Dùng excludeId để bỏ qua chính danh mục đang sửa.
   */
  private async assertSiblingNameAvailable(
    tx: Prisma.TransactionClient,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await tx.category.findFirst({
      where: {
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        `Đã có danh mục tên "${name}" trong cùng danh mục cha.`,
      );
    }
  }

  // Kiểm tra slug do Admin nhập chưa bị danh mục khác dùng (HTTP 409).
  private async assertSlugAvailable(
    tx: Prisma.TransactionClient,
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await tx.category.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `Slug "${slug}" đã được danh mục khác sử dụng.`,
      );
    }
  }

  /**
   * Tự sinh slug duy nhất từ tên: thử "slug", rồi "slug-2", "slug-3"... cho tới khi chưa tồn tại. 
   * Hậu tố được tính vào giới hạn 160 ký tự của cột.
   */
  private async generateUniqueSlug(
    tx: Prisma.TransactionClient,
    name: string,
  ): Promise<string> {
    const base = slugify(name) || FALLBACK_SLUG;

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const suffix = attempt === 1 ? '' : `-${attempt}`;
      const trimmedBase = base
        .slice(0, SLUG_MAX_LENGTH - suffix.length)
        .replace(/-+$/g, '');
      const candidate = `${trimmedBase}${suffix}`;

      const existing = await tx.category.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Không thể tự sinh slug duy nhất. Vui lòng nhập slug thủ công.',
    );
  }

  /**
   * Dự phòng cuối: nếu CSDL vẫn báo trùng khóa duy nhất (Prisma P2002), đổi
   * thành HTTP 409 thay vì để lỗi 500. Thực tế các kiểm tra ở trên đã chặn
   * trước, và khóa cấu trúc cây ngăn tranh chấp giữa các thao tác của service
   * này; đây chỉ là lưới an toàn cho ghi chép trực tiếp vào CSDL từ nơi khác.
   * Mọi lỗi khác được giữ nguyên.
   */
  private mapUniqueViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'Slug danh mục đã tồn tại. Vui lòng chọn Slug khác.',
      );
    }

    return error;
  }
}