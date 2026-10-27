// =============================================================================
// Nghiệp vụ quản lý tồn kho theo từng cặp (sản phẩm, kho):
//   ĐỌC  : findAll / findOne / findAlerts / findOpenAlerts
//   GHI  : create (khai báo dòng tồn kho) / restock (nhập hàng) / updateStock (kiểm kê)
//
// Phạm vi — phần KHÔNG nằm ở đây:
// - Giữ chỗ / giải phóng / chốt hàng khi đặt đơn là của P3 (StockReservationService + PrismaInventoryStockAdapter). Service này KHÔNG đụng tới cột "reserved_stock".
// - Mọi thay đổi tồn kho ở đây đều (1) ghi một dòng vào "inventory_audit_log" và (2) gọi InventoryAlertService.evaluate() để mở / nâng / đóng cảnh báo tồn thấp, tất cả TRONG CÙNG MỘT TRANSACTION: hoặc cùng thành công, hoặc cùng hoàn tác.
//
// Quy ước dữ liệu trả về:
// - Cột "id" của bảng inventory và stock_alerts là BIGINT. JavaScript không biểu
//   diễn an toàn mọi giá trị BIGINT bằng number và JSON không serialize được
//   BigInt, nên TOÀN BỘ id kiểu BIGINT được trả về dạng CHUỖI (string).
// - Giá (numeric) cũng trả về dạng chuỗi để không mất độ chính xác.
// - "costPrice" (giá vốn) là thông tin nhạy cảm: chỉ ADMIN nhận được. Với nhân viên
//   kho, giá trị này không được đọc ra khỏi CSDL (loại ngay trong câu SQL), không
//   chỉ là bị ẩn ở bước trả về.
// - Nhân viên kho KHÔNG thấy tồn kho / cảnh báo của kho đã ngừng hoạt động
//   (giống quy tắc của module warehouses). Admin thấy tất cả.
//
// CHỐNG ĐUA DỮ LIỆU (đồng thời):
// - Thứ tự khóa trong mọi thao tác ghi: kho (FOR NO KEY UPDATE) -> dòng inventory
//   (FOR UPDATE). Luồng đặt hàng của P3 chỉ khóa các dòng inventory (không khóa
//   dòng kho) nên không thể tạo vòng chờ khóa (deadlock) với luồng này.
// - Khóa dòng kho để việc kiểm tra SỨC CHỨA (tổng tồn của kho <= capacity) là tuần
//   tự: hai lần nhập hàng song song vào hai sản phẩm khác nhau của cùng một kho
//   không thể cùng vượt qua phép kiểm tra rồi cộng dồn vượt sức chứa.
// - Khóa FOR UPDATE dòng inventory trước khi đọc số liệu để so sánh với
//   reserved_stock mới nhất (luồng giữ chỗ của P3 cũng khóa dòng này).
// - Ràng buộc CHECK của CSDL (stock >= 0, reserved_stock <= stock...) là lớp chặn
//   cuối cùng; Service kiểm tra trước để trả thông báo tiếng Việt rõ ràng.
// =============================================================================

import { BadRequestException, ConflictException, Injectable, NotFoundException, } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryAlertService } from './inventory-alert.service';
import { type CreateInventoryDto } from './dto/create-inventory.dto';
import { type QueryInventoryDto, type QueryStockAlertsDto, } from './dto/query-inventory.dto';
import { type RestockInventoryDto } from './dto/restock-inventory.dto';
import { type UpdateStockDto } from './dto/update-stock.dto';

// ----------------------------------------------------------------------------
// Hằng số
// ----------------------------------------------------------------------------

// Giá trị lớn nhất của cột INTEGER trong PostgreSQL.
const INT4_MAX = 2147483647;

// Giá trị lớn nhất của cột BIGINT.
const BIGINT_MAX = 9223372036854775807n;

// Phân trang mặc định khi người gọi không truyền.
const DEFAULT_LIMIT = 20;

// Số cảnh báo tối đa findOpenAlerts() trả về một lần (dành cho job thông báo).
const OPEN_ALERTS_DEFAULT_LIMIT = 500;
const OPEN_ALERTS_MAX_LIMIT = 1000;

// Giá trị cột reference_type của nhật ký tồn kho (tối đa 40 ký tự).
const REF_CREATE = 'INVENTORY_CREATE';
const REF_RESTOCK = 'INVENTORY_RESTOCK';
const REF_ADJUST = 'INVENTORY_ADJUST';

// ----------------------------------------------------------------------------
// Kiểu dữ liệu trả về
// ----------------------------------------------------------------------------

export interface InventoryProductView {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  basePrice: string;
  isActive: boolean;
  // Chỉ có khi người xem là ADMIN.
  costPrice?: string | null;
}

export interface InventoryWarehouseView {
  id: string;
  code: string;
  name: string;
  region: string;
  isActive: boolean;
}

export interface InventoryView {
  // BIGINT dạng chuỗi.
  id: string;
  productId: string;
  warehouseId: string;
  // Tồn vật lý trong kho.
  stock: number;
  // Số đang được giữ chỗ cho các đơn chưa thanh toán xong (do luồng đặt hàng quản lý).
  reservedStock: number;
  // Số có thể bán = stock - reservedStock (cột tính sẵn của CSDL).
  availableStock: number;
  // Ngưỡng riêng của dòng này (null = dùng ngưỡng mặc định của kho).
  threshold: number | null;
  // Ngưỡng thực tế đang áp dụng = threshold riêng, nếu null thì ngưỡng mặc định của kho.
  effectiveThreshold: number;
  // true khi availableStock <= effectiveThreshold.
  isLowStock: boolean;
  version: number;
  lastRestockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  product: InventoryProductView;
  warehouse: InventoryWarehouseView;
}

export interface StockAlertView {
  // BIGINT dạng chuỗi.
  id: string;
  inventoryId: string;
  alertLevel: 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED';
  // Số liệu chụp tại thời điểm tạo / nâng cảnh báo.
  stockAtTrigger: number;
  availableAtTrigger: number;
  thresholdAtTrigger: number;
  triggeredAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  // Số liệu HIỆN TẠI của dòng tồn kho tương ứng.
  currentStock: number;
  currentAvailable: number;
  product: { id: string; sku: string; name: string };
  warehouse: { id: string; code: string; name: string };
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ----------------------------------------------------------------------------
// Kiểu dòng thô của các truy vấn SQL (alias cột trùng tên thuộc tính)
// ----------------------------------------------------------------------------

interface InventoryRow {
  id: string;
  productId: string;
  warehouseId: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold: number | null;
  effectiveThreshold: number;
  version: number;
  lastRestockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  productSku: string;
  productName: string;
  productImageUrl: string | null;
  productBasePrice: string;
  productCostPrice: string | null;
  productIsActive: boolean;
  warehouseCode: string;
  warehouseName: string;
  warehouseRegion: string;
  warehouseIsActive: boolean;
}

interface AlertRow {
  id: string;
  inventoryId: string;
  alertLevel: 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED';
  stockAtTrigger: number;
  availableAtTrigger: number;
  thresholdAtTrigger: number;
  triggeredAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  currentStock: number;
  currentAvailable: number;
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
}

// Dòng kho đã khóa trong transaction ghi.
interface LockedWarehouse {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}

// Dòng inventory đã khóa FOR UPDATE trong transaction ghi.
interface LockedInventory {
  id: string;
  warehouseId: string;
  stock: number;
  reservedStock: number;
  threshold: number | null;
}

// Bộ lọc của truy vấn danh sách tồn kho (undefined / null = không lọc).
interface InventoryFilter {
  id?: string | null;
  productId?: string | null;
  warehouseId?: string | null;
  lowStockOnly?: boolean;
  isAdmin: boolean;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertService: InventoryAlertService,
  ) {}

  // ==========================================================================
  // 1. ĐỌC
  // ==========================================================================

  // Danh sách tồn kho có lọc theo sản phẩm / kho / tồn thấp và phân trang
  // Sắp xếp theo mã kho, tên sản phẩm, ID để thứ tự ổn định giữa các trang.
  async findAll(
    query: QueryInventoryDto,
    role: UserRole,
  ): Promise<PagedResult<InventoryView>> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const filter: InventoryFilter = {
      productId: query.productId ?? null,
      warehouseId: query.warehouseId ?? null,
      lowStockOnly: query.lowStockOnly ?? false,
      isAdmin: role === UserRole.ADMIN,
    };

    const [rows, total] = await Promise.all([
      this.queryInventoryRows(this.prisma, filter, limit, offset),
      this.countInventoryRows(this.prisma, filter),
    ]);

    return {
      items: rows.map((row) => this.toInventoryView(row, filter.isAdmin)),
      total,
      limit,
      offset,
    };
  }

  // CHi tiết một dòng tồn kho. ID không hợp lệ -> 400; không tồn tại (Hoặc nhân viên khi xem dòng của kho đã ngừng hoạt động)
  async findOne(rawId: string, role: UserRole): Promise<InventoryView> {
    const id = this.parseInventoryId(rawId);
    const view = await this.readInventoryView(
      this.prisma,
      id,
      role === UserRole.ADMIN,
    );

    if (!view) {
      throw new NotFoundException('Không tìm thấy dòng tồn kho.');
    }

    return view;
  }

  // Danh sách cảnh báo tồn kho thấp. Mặc định chỉ lấy cảnh báo đang mở (OPEN), cảnh báo mức CRITICAL xếp trước, rồi tới cảnh báo mới nhất.
  async findAlerts(
    query: QueryStockAlertsDto,
    role: UserRole,
  ): Promise<PagedResult<StockAlertView>> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const status = query.status ?? 'OPEN';
    const warehouseId = query.warehouseId ?? null;
    const isAdmin = role === UserRole.ADMIN;

    const rows = await this.prisma.$queryRaw<AlertRow[]>`
      SELECT a."id"::text AS "id",
             a."inventory_id"::text AS "inventoryId",
             a."alert_level"::text AS "alertLevel",
             a."status"::text AS "status",
             a."stock_at_trigger" AS "stockAtTrigger",
             a."available_at_trigger" AS "availableAtTrigger",
             a."threshold_at_trigger" AS "thresholdAtTrigger",
             a."triggered_at" AS "triggeredAt",
             a."resolved_at" AS "resolvedAt",
             a."resolved_by"::text AS "resolvedBy",
             i."stock" AS "currentStock",
             i."available_stock" AS "currentAvailable",
             p."id"::text AS "productId",
             p."sku" AS "productSku",
             p."name" AS "productName",
             w."id"::text AS "warehouseId",
             w."code" AS "warehouseCode",
             w."name" AS "warehouseName"
        FROM "stock_alerts" a
        JOIN "inventory" i ON i."id" = a."inventory_id"
        JOIN "products" p ON p."id" = i."product_id"
        JOIN "warehouses" w ON w."id" = i."warehouse_id"
       WHERE (${status}::text = 'ALL' OR a."status"::text = ${status}::text)
         AND (${warehouseId}::uuid IS NULL OR i."warehouse_id" = ${warehouseId}::uuid)
         AND (${isAdmin}::boolean OR w."is_active")
       ORDER BY (a."status" = 'OPEN'::"AlertStatus") DESC,
                a."alert_level" DESC,
                a."triggered_at" DESC,
                a."id" DESC
       LIMIT ${limit}::integer OFFSET ${offset}::integer
    `;

    const countRows = await this.prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::integer AS "total"
        FROM "stock_alerts" a
        JOIN "inventory" i ON i."id" = a."inventory_id"
        JOIN "warehouses" w ON w."id" = i."warehouse_id"
       WHERE (${status}::text = 'ALL' OR a."status"::text = ${status}::text)
         AND (${warehouseId}::uuid IS NULL OR i."warehouse_id" = ${warehouseId}::uuid)
         AND (${isAdmin}::boolean OR w."is_active")
    `;

    return {
      items: rows.map((row) => this.toAlertView(row)),
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    };
  }

  // Dành cho job thông báo tồn thấp của P5: lấy các cảnh báo đang MỞ (mọi kho, kể cả kho đã ngừng hoạt động), cảnh báo nghiêm trọng xếp trước)
  async findOpenAlerts(
    limit: number = OPEN_ALERTS_DEFAULT_LIMIT,
  ): Promise<StockAlertView[]> {
    const safeLimit = Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), OPEN_ALERTS_MAX_LIMIT)
      : OPEN_ALERTS_DEFAULT_LIMIT;

    const result = await this.findAlerts(
      { status: 'OPEN', limit: safeLimit, offset: 0 },
      UserRole.ADMIN,
    );
    return result.items;
  }

  // ==========================================================================
  // 2. GHI (chỉ ADMIN — được chặn ở Controller)
  // ==========================================================================

  /**
   * Khai báo một dòng tồn kho mới: "sản phẩm X được lưu ở kho Y".
   *
   * - Kho phải tồn tại và đang hoạt động (404 nếu không), sản phẩm phải tồn tại (404).
   * - Mỗi cặp (sản phẩm, kho) chỉ một dòng: trùng -> 409.
   * - Tồn ban đầu > 0 phải nằm trong sức chứa của kho (409 nếu vượt).
   * - Tồn ban đầu > 0 được ghi nhật ký (lý do RESTOCK) và đặt lastRestockedAt.
   * - Dòng mới có tồn <= ngưỡng (kể cả tồn 0) sẽ lập tức có cảnh báo tồn thấp.
   */
  async create(
    dto: CreateInventoryDto,
    actorId: string,
  ): Promise<InventoryView> {
    const initialStock = dto.initialStock ?? 0;
    const threshold = dto.threshold ?? null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await this.lockWarehouse(tx, dto.warehouseId);
        if (!warehouse || !warehouse.isActive) {
          throw new NotFoundException(
            'Kho hàng không tồn tại hoặc đã ngừng hoạt động.',
          );
        }

        // Khóa KEY SHARE dòng sản phẩm để sản phẩm không bị xóa giữa chừng.
        const products = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"::text AS "id" FROM "products"
           WHERE "id" = ${dto.productId}::uuid
             FOR KEY SHARE
        `;
        if (products.length !== 1) {
          throw new NotFoundException('Sản phẩm không tồn tại.');
        }

        await this.assertCapacity(tx, warehouse, initialStock);

        // ON CONFLICT DO NOTHING: nếu cặp (sản phẩm, kho) đã có dòng thì không chèn và không trả hàng nào -> báo 409. \
        // Cột "available_stock" là cột tính sẵn nên phải dùng SQL thô (Prisma create không ghi được cột này).
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "inventory" (
            "product_id", "warehouse_id", "stock", "threshold",
            "last_restocked_at", "updated_at"
          )
          VALUES (
            ${dto.productId}::uuid,
            ${dto.warehouseId}::uuid,
            ${initialStock}::integer,
            ${threshold}::integer,
            CASE WHEN ${initialStock}::integer > 0 THEN NOW() ELSE NULL END,
            NOW()
          )
          ON CONFLICT ("product_id", "warehouse_id") DO NOTHING
          RETURNING "id"::text AS "id"
        `;
        if (inserted.length !== 1) {
          throw new ConflictException(
            'Sản phẩm này đã có dòng tồn kho ở kho đã chọn.',
          );
        }
        const inventoryId = inserted[0].id;

        if (initialStock > 0) {
          await this.writeAuditLog(tx, {
            inventoryId,
            reason: 'RESTOCK',
            stockBefore: 0,
            stockAfter: initialStock,
            reservedBefore: 0,
            reservedAfter: 0,
            referenceType: REF_CREATE,
            actorId,
            note: dto.note ?? null,
          });
        }

        await this.alertService.evaluate(tx, [BigInt(inventoryId)], actorId);

        return this.readInventoryViewOrThrow(tx, inventoryId);
      });
    } catch (error) {
      throw this.translateDbError(error);
    }
  }

  /**
   * Nhập THÊM hàng vào một dòng tồn kho (cộng dồn vào "stock").
   *
   * - Kho phải đang hoạt động (409 nếu đã ngừng hoạt động).
   * - Tổng tồn của kho sau khi nhập không được vượt sức chứa (409).
   * - Ghi nhật ký (lý do RESTOCK), cập nhật lastRestockedAt và tự đóng cảnh báo tồn thấp nếu hàng khả dụng đã vượt ngưỡng.
   */
  async restock(
    rawId: string,
    dto: RestockInventoryDto,
    actorId: string,
  ): Promise<InventoryView> {
    const id = this.parseInventoryId(rawId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { warehouse, row } = await this.lockWarehouseAndRow(tx, id);

        if (!warehouse.isActive) {
          throw new ConflictException(
            `Kho "${warehouse.name}" đã ngừng hoạt động, không thể nhập hàng.`,
          );
        }

        const newStock = row.stock + dto.quantity;
        if (newStock > INT4_MAX) {
          throw new ConflictException(
            `Tồn kho sau khi nhập vượt giá trị tối đa cho phép (${INT4_MAX}).`,
          );
        }

        await this.assertCapacity(tx, warehouse, dto.quantity);

        await tx.$executeRaw`
          UPDATE "inventory"
             SET "stock" = ${newStock}::integer,
                 "last_restocked_at" = NOW()
           WHERE "id" = ${id}::bigint
        `;

        await this.writeAuditLog(tx, {
          inventoryId: id,
          reason: 'RESTOCK',
          stockBefore: row.stock,
          stockAfter: newStock,
          reservedBefore: row.reservedStock,
          reservedAfter: row.reservedStock,
          referenceType: REF_RESTOCK,
          actorId,
          note: dto.note ?? null,
        });

        await this.alertService.evaluate(tx, [BigInt(id)], actorId);

        return this.readInventoryViewOrThrow(tx, id);
      });
    } catch (error) {
      throw this.translateDbError(error);
    }
  }

  /**
   * Kiểm kê / điều chỉnh: đặt lại "stock" về số đếm thực tế và/hoặc đổi ngưỡng cảnh báo riêng của dòng. Cập nhật TỪNG PHẦN: trường không gửi giữ nguyên.
   *
   * - Phải có ít nhất một trong hai trường stock / threshold (400).
   * - Không được đặt stock thấp hơn số đang giữ chỗ (409): hàng đang giữ cho đơn chưa thanh toán xong không thể "biến mất".
   * - TĂNG tồn: kho phải đang hoạt động và không vượt sức chứa (409). 
   * - GIẢM tồn luôn được phép kể cả khi kho đã ngừng hoạt động (để ghi nhận xuất / chuyển hết hàng khỏi kho đã đóng).
   * - Gửi lại đúng giá trị hiện tại thì không ghi gì và trả dòng hiện có.
   * - Có thay đổi stock thì ghi nhật ký (lý do MANUAL_ADJUST, quantityDelta là mức thay đổi thật, có thể âm). Đổi ngưỡng hoặc stock đều đánh giá lại cảnh báo.
   */
  async updateStock(
    rawId: string,
    dto: UpdateStockDto,
    actorId: string,
  ): Promise<InventoryView> {
    const id = this.parseInventoryId(rawId);

    if (dto.stock === undefined && dto.threshold === undefined) {
      throw new BadRequestException(
        'Cần gửi ít nhất một trong hai trường Stock hoặc Threshold.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { warehouse, row } = await this.lockWarehouseAndRow(tx, id);

        const newStock = dto.stock ?? row.stock;
        const newThreshold =
          dto.threshold === undefined ? row.threshold : dto.threshold;

        if (newStock < row.reservedStock) {
          throw new ConflictException(
            `Không thể đặt tồn kho thấp hơn số đang giữ chỗ cho đơn hàng (${row.reservedStock}).`,
          );
        }

        const stockChanged = newStock !== row.stock;
        const thresholdChanged = newThreshold !== row.threshold;

        // Không có gì thay đổi: trả lại dòng hiện tại, không ghi nhật ký.
        if (!stockChanged && !thresholdChanged) {
          return this.readInventoryViewOrThrow(tx, id);
        }

        if (stockChanged && newStock > row.stock) {
          if (!warehouse.isActive) {
            throw new ConflictException(
              `Kho "${warehouse.name}" đã ngừng hoạt động, không thể tăng tồn kho.`,
            );
          }
          await this.assertCapacity(tx, warehouse, newStock - row.stock);
        }

        if (stockChanged) {
          // Có ghi "stock" nên trigger tăng "version" được kích hoạt đúng ý.
          await tx.$executeRaw`
            UPDATE "inventory"
               SET "stock" = ${newStock}::integer,
                   "threshold" = ${newThreshold}::integer
             WHERE "id" = ${id}::bigint
          `;

          await this.writeAuditLog(tx, {
            inventoryId: id,
            reason: 'MANUAL_ADJUST',
            stockBefore: row.stock,
            stockAfter: newStock,
            reservedBefore: row.reservedStock,
            reservedAfter: row.reservedStock,
            referenceType: REF_ADJUST,
            actorId,
            note: dto.note ?? null,
          });
        } else {
          // Chỉ đổi ngưỡng: không ghi cột "stock" để không tăng "version" vô ích.
          await tx.$executeRaw`
            UPDATE "inventory"
               SET "threshold" = ${newThreshold}::integer
             WHERE "id" = ${id}::bigint
          `;
        }

        await this.alertService.evaluate(tx, [BigInt(id)], actorId);

        return this.readInventoryViewOrThrow(tx, id);
      });
    } catch (error) {
      throw this.translateDbError(error);
    }
  }

  // ==========================================================================
  // 3. HÀM NỘI BỘ — Id, khóa, kiểm tra
  // ==========================================================================

  /**
   * Kiểm tra id dòng tồn kho lấy từ đường dẫn: chỉ nhận số nguyên dương trong miền BIGINT, không số 0 đứng đầu. 
   * Trả về chính chuỗi đó (chuỗi an toàn để truyền vào ::bigint, không mất độ chính xác như number).
   */
  private parseInventoryId(raw: string): string {
    if (
      typeof raw !== 'string' ||
      !/^[1-9][0-9]{0,18}$/.test(raw) ||
      BigInt(raw) > BIGINT_MAX
    ) {
      throw new BadRequestException('ID tồn kho không hợp lệ.');
    }

    return raw;
  }

  /**
   * Khóa dòng kho bằng FOR NO KEY UPDATE (cùng cách module warehouses): chặn transaction ghi khác đồng thời trên cùng kho nhưng không chặn việc kiểm tra khóa ngoại của luồng đặt hàng. 
   * Trả về null nếu kho không tồn tại.
   */
  private async lockWarehouse(
    tx: Prisma.TransactionClient,
    warehouseId: string,
  ): Promise<LockedWarehouse | null> {
    const rows = await tx.$queryRaw<LockedWarehouse[]>`
      SELECT "id"::text AS "id",
             "name" AS "name",
             "capacity" AS "capacity",
             "is_active" AS "isActive"
        FROM "warehouses"
       WHERE "id" = ${warehouseId}::uuid
         FOR NO KEY UPDATE
    `;

    return rows[0] ?? null;
  }

  /**
   * Khóa theo đúng thứ tự: 
   * - (1) xem nhanh dòng inventory để biết kho, 
   * - (2) khóa kho,
   * - (3) khóa dòng inventory FOR UPDATE và đọc số liệu mới nhất. 
   * Cột warehouse_id của dòng inventory không bao giờ thay đổi nên bước (1) không bị lỗi thời.
   */
  private async lockWarehouseAndRow(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<{ warehouse: LockedWarehouse; row: LockedInventory }> {
    const peek = await tx.$queryRaw<Array<{ warehouseId: string }>>`
      SELECT "warehouse_id"::text AS "warehouseId"
        FROM "inventory"
       WHERE "id" = ${id}::bigint
    `;
    if (peek.length !== 1) {
      throw new NotFoundException('Không tìm thấy dòng tồn kho.');
    }

    const warehouse = await this.lockWarehouse(tx, peek[0].warehouseId);
    if (!warehouse) {
      throw new NotFoundException('Không tìm thấy kho hàng.');
    }

    const rows = await tx.$queryRaw<LockedInventory[]>`
      SELECT "id"::text AS "id",
             "warehouse_id"::text AS "warehouseId",
             "stock" AS "stock",
             "reserved_stock" AS "reservedStock",
             "threshold" AS "threshold"
        FROM "inventory"
       WHERE "id" = ${id}::bigint
         FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException('Không tìm thấy dòng tồn kho.');
    }

    return { warehouse, row: rows[0] };
  }

  /**
   * Kiểm tra SỨC CHỨA: tổng "stock" của mọi dòng trong kho + phần tăng thêm không được vượt capacity. 
   * Kho không khai báo capacity (null) hoặc phần tăng <= 0 thì bỏ qua. 
   * Phải gọi KHI ĐANG GIỮ khóa dòng kho (xem lockWarehouse) để kết quả không bị các giao dịch song song làm sai lệch.
   */
  private async assertCapacity(
    tx: Prisma.TransactionClient,
    warehouse: LockedWarehouse,
    increase: number,
  ): Promise<void> {
    if (warehouse.capacity === null || increase <= 0) {
      return;
    }

    const rows = await tx.$queryRaw<Array<{ total: string }>>`
      SELECT COALESCE(SUM("stock"), 0)::text AS "total"
        FROM "inventory"
       WHERE "warehouse_id" = ${warehouse.id}::uuid
    `;

    // Dùng BigInt để cộng dồn không tràn kể cả khi kho có rất nhiều dòng.
    const current = BigInt(rows[0]?.total ?? '0');
    const capacity = BigInt(warehouse.capacity);

    if (current + BigInt(increase) > capacity) {
      const free = capacity > current ? capacity - current : 0n;
      throw new ConflictException(
        `Vượt sức chứa của kho "${warehouse.name}": sức chứa ${capacity}, đang lưu ${current}, còn trống ${free}, cần thêm ${increase}.`,
      );
    }
  }

  /**
   * Ghi một dòng vào nhật ký tồn kho. "quantityDelta" là mức thay đổi THẬT của tồn vật lý (stockAfter - stockBefore), đúng quy ước chung với luồng đặt hàng.
   * reference_id là id dòng tồn kho để truy ngược; note đã được cắt khoảng trắng và giới hạn 500 ký tự ở DTO.
   */
  private async writeAuditLog(
    tx: Prisma.TransactionClient,
    entry: {
      inventoryId: string;
      reason: 'RESTOCK' | 'MANUAL_ADJUST';
      stockBefore: number;
      stockAfter: number;
      reservedBefore: number;
      reservedAfter: number;
      referenceType: string;
      actorId: string;
      note: string | null;
    },
  ): Promise<void> {
    const quantityDelta = entry.stockAfter - entry.stockBefore;

    await tx.$executeRaw`
      INSERT INTO "inventory_audit_log" (
        "inventory_id", "reason",
        "stock_before", "stock_after",
        "reserved_before", "reserved_after",
        "quantity_delta",
        "reference_type", "reference_id",
        "actor_id", "note"
      )
      VALUES (
        ${entry.inventoryId}::bigint,
        ${entry.reason}::"InventoryChangeReason",
        ${entry.stockBefore}::integer, ${entry.stockAfter}::integer,
        ${entry.reservedBefore}::integer, ${entry.reservedAfter}::integer,
        ${quantityDelta}::integer,
        ${entry.referenceType}::varchar, ${entry.inventoryId}::varchar,
        ${entry.actorId}::uuid, ${entry.note}::varchar
      )
    `;
  }

  /**
   * Chuyển lỗi CSDL còn sót (lớp chặn cuối cùng) thành lỗi HTTP dễ hiểu. 
   * Lỗi HTTP của chính Service (404/409/400...) được giữ nguyên. 
   * Mã SQLSTATE nằm ở "code" (driver trực tiếp) hoặc "meta.code" (PrismaClientKnownRequestError P2010).
   */
  private translateDbError(error: unknown): unknown {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      return error;
    }

    const candidate = error as {
      code?: unknown;
      meta?: { code?: unknown };
    } | null;
    const sqlState =
      (typeof candidate?.meta?.code === 'string' && candidate.meta.code) ||
      (typeof candidate?.code === 'string' && candidate.code) ||
      '';

    // 23514: vi phạm CHECK (stock/reserved/threshold âm hoặc reserved > stock).
    if (sqlState === '23514') {
      return new ConflictException(
        'Số liệu tồn kho không hợp lệ (Vi phạm ràng buộc tồn kho).',
      );
    }

    // 23503: vi phạm khóa ngoại (sản phẩm / kho vừa bị xóa).
    if (sqlState === '23503') {
      return new NotFoundException('Sản phẩm hoặc kho hàng không còn tồn tại.');
    }

    return error;
  }

  // ==========================================================================
  // 4. HÀM NỘI BỘ — Truy vấn đọc và chuyển đổi dữ liệu
  // ==========================================================================

  /**
   * Truy vấn danh sách dòng tồn kho kèm sản phẩm và kho. 
   * Mọi bộ lọc dùng dạng "(tham số IS NULL OR cột = tham số)" nên chỉ một câu SQL tĩnh, vẫn tham số hóa hoàn toàn (không nối chuỗi). Giá vốn chỉ được đọc khi người xem là Admin.
   */
  private async queryInventoryRows(
    client: Prisma.TransactionClient,
    filter: InventoryFilter,
    limit: number,
    offset: number,
  ): Promise<InventoryRow[]> {
    const id = filter.id ?? null;
    const productId = filter.productId ?? null;
    const warehouseId = filter.warehouseId ?? null;
    const lowStockOnly = filter.lowStockOnly ?? false;
    const isAdmin = filter.isAdmin;

    return client.$queryRaw<InventoryRow[]>`
      SELECT i."id"::text AS "id",
             i."product_id"::text AS "productId",
             i."warehouse_id"::text AS "warehouseId",
             i."stock" AS "stock",
             i."reserved_stock" AS "reservedStock",
             i."available_stock" AS "availableStock",
             i."threshold" AS "threshold",
             COALESCE(i."threshold", w."default_low_stock_threshold") AS "effectiveThreshold",
             i."version" AS "version",
             i."last_restocked_at" AS "lastRestockedAt",
             i."created_at" AS "createdAt",
             i."updated_at" AS "updatedAt",
             p."sku" AS "productSku",
             p."name" AS "productName",
             p."image_url" AS "productImageUrl",
             p."base_price"::text AS "productBasePrice",
             CASE WHEN ${isAdmin}::boolean THEN p."cost_price"::text ELSE NULL END AS "productCostPrice",
             p."is_active" AS "productIsActive",
             w."code" AS "warehouseCode",
             w."name" AS "warehouseName",
             w."region" AS "warehouseRegion",
             w."is_active" AS "warehouseIsActive"
        FROM "inventory" i
        JOIN "products" p ON p."id" = i."product_id"
        JOIN "warehouses" w ON w."id" = i."warehouse_id"
       WHERE (${id}::bigint IS NULL OR i."id" = ${id}::bigint)
         AND (${productId}::uuid IS NULL OR i."product_id" = ${productId}::uuid)
         AND (${warehouseId}::uuid IS NULL OR i."warehouse_id" = ${warehouseId}::uuid)
         AND (${lowStockOnly}::boolean = false
              OR i."available_stock" <= COALESCE(i."threshold", w."default_low_stock_threshold"))
         AND (${isAdmin}::boolean OR w."is_active")
       ORDER BY w."code", p."name", i."id"
       LIMIT ${limit}::integer OFFSET ${offset}::integer
    `;
  }

  // Đếm tổng số dòng thỏa bộ lọc (không phân trang) — cùng điều kiện với truy vấn trên.
  private async countInventoryRows(
    client: Prisma.TransactionClient,
    filter: InventoryFilter,
  ): Promise<number> {
    const productId = filter.productId ?? null;
    const warehouseId = filter.warehouseId ?? null;
    const lowStockOnly = filter.lowStockOnly ?? false;
    const isAdmin = filter.isAdmin;

    const rows = await client.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::integer AS "total"
        FROM "inventory" i
        JOIN "warehouses" w ON w."id" = i."warehouse_id"
       WHERE (${productId}::uuid IS NULL OR i."product_id" = ${productId}::uuid)
         AND (${warehouseId}::uuid IS NULL OR i."warehouse_id" = ${warehouseId}::uuid)
         AND (${lowStockOnly}::boolean = false
              OR i."available_stock" <= COALESCE(i."threshold", w."default_low_stock_threshold"))
         AND (${isAdmin}::boolean OR w."is_active")
    `;

    return rows[0]?.total ?? 0;
  }

  // Đọc MỘT dòng tồn kho theo id; trả null nếu không có (hoặc không được xem).
  private async readInventoryView(
    client: Prisma.TransactionClient,
    id: string,
    isAdmin: boolean,
  ): Promise<InventoryView | null> {
    const rows = await this.queryInventoryRows(client, { id, isAdmin }, 1, 0);

    return rows[0] ? this.toInventoryView(rows[0], isAdmin) : null;
  }

  // Như trên nhưng dùng sau khi ghi (dưới quyền Admin): dòng phải tồn tại.
  private async readInventoryViewOrThrow(
    client: Prisma.TransactionClient,
    id: string,
  ): Promise<InventoryView> {
    const view = await this.readInventoryView(client, id, true);

    if (!view) {
      throw new NotFoundException('Không tìm thấy dòng tồn kho.');
    }

    return view;
  }

  // Dòng SQL phẳng -> đối tượng trả về dạng lồng. costPrice chỉ có với Admin.
  private toInventoryView(row: InventoryRow, isAdmin: boolean): InventoryView {
    const product: InventoryProductView = {
      id: row.productId,
      sku: row.productSku,
      name: row.productName,
      imageUrl: row.productImageUrl,
      basePrice: row.productBasePrice,
      isActive: row.productIsActive,
    };
    if (isAdmin) {
      product.costPrice = row.productCostPrice;
    }

    return {
      id: row.id,
      productId: row.productId,
      warehouseId: row.warehouseId,
      stock: row.stock,
      reservedStock: row.reservedStock,
      availableStock: row.availableStock,
      threshold: row.threshold,
      effectiveThreshold: row.effectiveThreshold,
      isLowStock: row.availableStock <= row.effectiveThreshold,
      version: row.version,
      lastRestockedAt: row.lastRestockedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      product,
      warehouse: {
        id: row.warehouseId,
        code: row.warehouseCode,
        name: row.warehouseName,
        region: row.warehouseRegion,
        isActive: row.warehouseIsActive,
      },
    };
  }

  // Dòng SQL phẳng của cảnh báo -> đối tượng trả về dạng lồng.
  private toAlertView(row: AlertRow): StockAlertView {
    return {
      id: row.id,
      inventoryId: row.inventoryId,
      alertLevel: row.alertLevel,
      status: row.status,
      stockAtTrigger: row.stockAtTrigger,
      availableAtTrigger: row.availableAtTrigger,
      thresholdAtTrigger: row.thresholdAtTrigger,
      triggeredAt: row.triggeredAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      currentStock: row.currentStock,
      currentAvailable: row.currentAvailable,
      product: {
        id: row.productId,
        sku: row.productSku,
        name: row.productName,
      },
      warehouse: {
        id: row.warehouseId,
        code: row.warehouseCode,
        name: row.warehouseName,
      },
    };
  }
}