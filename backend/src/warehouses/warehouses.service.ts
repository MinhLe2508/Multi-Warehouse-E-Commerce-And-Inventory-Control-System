// =============================================================================
// Nghiệp vụ quản lý kho hàng: xem danh sách, xem chi tiết, tạo mới, cập nhật và ngừng hoạt động kho.
//
// Nguyên tắc thiết kế:
// 1. Không xóa cứng kho. "Xóa" kho nghĩa là đặt isActive = false (xóa mềm).
//    Lý do: bảng Inventory, OrderItem tham chiếu kho bằng khóa ngoại
//    "onDelete: Restrict" — xóa cứng kho đã có lịch sử sẽ bị CSDL chặn, và
//    kể cả khi được phép cũng làm mất dấu vết kho đã xuất hàng cho đơn cũ.
// 2. Kho ngừng hoạt động vẫn giữ nguyên mã kho (cột "code" UNIQUE áp dụng cho
//    cả kho đã ngừng), vẫn có thể kích hoạt lại bằng update({ isActive: true }).
// 3. Mọi thao tác SỬA đi qua transaction và khóa dòng kho (FOR NO KEY UPDATE)
//    để 2 Admin sửa đồng thời cùng 1 kho được xử lý tuần tự, các kiểm tra
//    nghiệp vụ (sức chứa, giữ chỗ) không bị đọc dữ liệu cũ.
// 4. Service này được EXPORT ra ngoài (xem warehouses.module.ts) để module
//    khác (Inventory, Orders) dùng lại, ví dụ getActiveWarehouseOrThrow().
// =============================================================================

import { BadRequestException, ConflictException, Injectable, NotFoundException, } from '@nestjs/common';
import { Prisma, type Warehouse } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type CreateWarehouseDto } from './dto/create-warehouse.dto';
import { type UpdateWarehouseDto } from './dto/update-warehouse.dto';

// Tùy chọn lọc khi lấy danh sách kho.
export interface FindWarehousesOptions {
  // true: lấy cả kho đã ngừng hoạt động (chỉ Admin được dùng, kiểm tra ở Controller).
  includeInactive: boolean;
  // Lọc theo khu vực (không phân biệt hoa thường). Không truyền: lấy mọi khu vực.
  region?: string;
}

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // 1. TRUY VẤN
  // ==========================================================================

  /**
   * Lấy danh sách kho. Mặc định chỉ trả kho đang hoạt động.
   *
   * Sắp xếp: kho hoạt động trước, rồi theo khu vực và tên — thuận tiện cho
   * dropdown chọn kho. Số lượng kho rất nhỏ (vài kho) nên KHÔNG phân trang.
   */
  async findAll(options: FindWarehousesOptions): Promise<Warehouse[]> {
    const where: Prisma.WarehouseWhereInput = {};

    if (!options.includeInactive) {
      where.isActive = true;
    }

    if (options.region) {
      where.region = { equals: options.region, mode: 'insensitive' };
    }

    return this.prisma.warehouse.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { region: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Lấy chi tiết 1 kho theo id.
   *
   * includeInactive = false: kho đã ngừng hoạt động bị coi như KHÔNG TỒN TẠI
   * (HTTP 404) — người không phải Admin không cần biết kho đó từng có.
   */
  async findOne(id: string, includeInactive: boolean): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });

    if (!warehouse || (!includeInactive && !warehouse.isActive)) {
      throw new NotFoundException('Không tìm thấy kho hàng.');
    }

    return warehouse;
  }

  /**
   * Dành cho module khác (Inventory, Orders): lấy kho ĐANG HOẠT ĐỘNG hoặc ném
   * lỗi HTTP 404 nếu kho không tồn tại / đã ngừng hoạt động.
   *
   * Tham số "client" cho phép truyền transaction đang mở của người gọi để việc
   * kiểm tra nằm CÙNG transaction với thao tác ghi tồn kho (đúng nguyên tắc:
   * mọi thao tác ghi tồn kho nằm trong transaction do caller truyền vào).
   * Không truyền thì dùng kết nối mặc định.
   */
  async getActiveWarehouseOrThrow(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Warehouse> {
    const warehouse = await client.warehouse.findUnique({ where: { id } });

    if (!warehouse || !warehouse.isActive) {
      throw new NotFoundException(
        'Kho hàng không tồn tại hoặc đã ngừng hoạt động.',
      );
    }

    return warehouse;
  }

  // ==========================================================================
  // 2. TẠO MỚI
  // ==========================================================================

  /**
   * Tạo kho mới (luôn ở trạng thái hoạt động).
   */
  async create(input: CreateWarehouseDto): Promise<Warehouse> {
    try {
      return await this.prisma.warehouse.create({
        data: {
          code: input.code,
          name: input.name,
          region: input.region,
          address: input.address,
          capacity: input.capacity,
          defaultLowStockThreshold: input.defaultLowStockThreshold,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Mã kho "${input.code}" đã tồn tại (Kể cả kho đã ngừng hoạt động).`,
        );
      }
      throw error;
    }
  }

  // ==========================================================================
  // 3. CẬP NHẬT VÀ NGỪNG HOẠT ĐỘNG
  // ==========================================================================

  /**
   * Cập nhật từng phần thông tin kho (chỉ các trường được gửi mới bị đổi).
   *
   * Luồng xử lý (toàn bộ trong 1 transaction):
   * 1. Khóa dòng kho (FOR NO KEY UPDATE) — tuần tự hóa các lần sửa đồng thời.
   * 2. Nếu đang NGỪNG HOẠT ĐỘNG kho: từ chối khi còn tồn kho giữ chỗ.
   * 3. Nếu ĐỔI SỨC CHỨA sang số hữu hạn: từ chối khi nhỏ hơn tổng tồn kho hiện có.
   * 4. Ghi cập nhật.
   */
  async update(id: string, input: UpdateWarehouseDto): Promise<Warehouse> {
    const data = this.buildUpdateData(input);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockWarehouse(tx, id);

      const current = await tx.warehouse.findUniqueOrThrow({ where: { id } });

      // Chỉ kiểm tra khi thực sự chuyển từ "hoạt động" sang "ngừng hoạt động".
      // Gọi lại trên kho đã ngừng hoạt động là thao tác lặp, vô hại (idempotent).
      if (input.isActive === false && current.isActive) {
        await this.assertNoActiveReservations(tx, current);
      }

      // capacity = null nghĩa là bỏ giới hạn: luôn hợp lệ, không cần kiểm tra.
      if (typeof input.capacity === 'number') {
        await this.assertCapacityEnough(tx, current, input.capacity);
      }

      return tx.warehouse.update({ where: { id }, data });
    });
  }

  /**
   * Ngừng hoạt động kho (xóa mềm) — dùng cho endpoint DELETE /warehouses/:id.
   * Dùng lại update() để áp dụng cùng quy tắc kiểm tra giữ chỗ.
   */
  async deactivate(id: string): Promise<void> {
    await this.update(id, { isActive: false });
  }

  // ==========================================================================
  // 4. HÀM NỘI BỘ
  // ==========================================================================

  /**
   * Chuyển DTO thành dữ liệu cập nhật Prisma, CHỈ gồm các trường được gửi.
   * Phân biệt undefined (không đổi) với null (xóa giá trị) — xem chú thích
   * đầu file update-warehouse.dto.ts.
   */
  private buildUpdateData(input: UpdateWarehouseDto): Prisma.WarehouseUpdateInput {
    const data: Prisma.WarehouseUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.region !== undefined) data.region = input.region;
    if (input.address !== undefined) data.address = input.address;
    if (input.capacity !== undefined) data.capacity = input.capacity;
    if (input.defaultLowStockThreshold !== undefined) {
      data.defaultLowStockThreshold = input.defaultLowStockThreshold;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return data;
  }

  /**
   * Khóa dòng kho để tuần tự hóa các thao tác sửa đồng thời
   */
  private async lockWarehouse(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "warehouses" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE
    `;

    if (rows.length !== 1) {
      throw new NotFoundException('Không tìm thấy kho hàng.');
    }
  }

  /**
   * Từ chối ngừng hoạt động kho nếu còn dòng tồn kho đang được giữ chỗ
   * (reservedStock > 0) — nghĩa là có đơn hàng chưa thanh toán xong đang giữ
   * hàng ở kho này. Ngừng hoạt động lúc này sẽ để lại đơn hàng treo.
   */
  private async assertNoActiveReservations(
    tx: Prisma.TransactionClient,
    warehouse: Warehouse,
  ): Promise<void> {
    const reservedRows = await tx.inventory.count({
      where: { warehouseId: warehouse.id, reservedStock: { gt: 0 } },
    });

    if (reservedRows > 0) {
      throw new ConflictException(
        `Không thể ngừng hoạt động kho "${warehouse.name}" vì còn ${reservedRows} dòng tồn kho đang được giữ chỗ cho đơn hàng chưa hoàn tất. Hãy chờ các đơn này hoàn tất hoặc hết hạn giữ chỗ.`,
      );
    }
  }

  /**
   * Từ chối đặt sức chứa nhỏ hơn tổng số lượng tồn kho vật lý hiện có trong kho.
   * (stock là tổng số hàng vật lý, đã bao gồm phần đang giữ chỗ.)
   */
  private async assertCapacityEnough(
    tx: Prisma.TransactionClient,
    warehouse: Warehouse,
    newCapacity: number,
  ): Promise<void> {
    const aggregate = await tx.inventory.aggregate({
      where: { warehouseId: warehouse.id },
      _sum: { stock: true },
    });

    const totalStock = aggregate._sum.stock ?? 0;

    if (totalStock > newCapacity) {
      throw new ConflictException(
        `Không thể đặt sức chứa kho "${warehouse.name}" là ${newCapacity} vì tổng tồn kho hiện có là ${totalStock}.`,
      );
    }
  }
}