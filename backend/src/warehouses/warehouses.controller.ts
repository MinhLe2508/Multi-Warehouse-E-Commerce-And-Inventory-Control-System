// =============================================================================
// Các REST API quản lý kho hàng:
//
//   GET    /warehouses        Danh sách kho         (ADMIN, WAREHOUSE_STAFF)
//   GET    /warehouses/:id    Chi tiết 1 kho        (ADMIN, WAREHOUSE_STAFF)
//   POST   /warehouses        Tạo kho mới           (chỉ ADMIN)
//   PUT    /warehouses/:id    Cập nhật từng phần    (chỉ ADMIN)
//   DELETE /warehouses/:id    Ngừng hoạt động kho   (chỉ ADMIN)
//
// PHÂN QUYỀN:
// - Không có endpoint công khai: khách hàng (CUSTOMER) không cần xem danh sách kho
// - Việc chọn kho giao hàng do hệ thống đặt hàng tự quyết định
// - Thứ tự guard: xác thực JWT, kiểm tra đổi mật khẩu lần đầu, kiểm tra vai trò.
// - Kho ĐÃ NGỪNG HOẠT ĐỘNG chỉ Admin được xem (?includeInactive=true).
// - Nhân viên kho yêu cầu xem kho đã ngừng sẽ nhận HTTP 403 (danh sách) hoặc 404 (chi tiết).
//
// CONTROLLER KHÔNG chứa nghiệp vụ, mọi kiểm tra và truy vấn CSDL nằm trong WarehousesService
// DTO được import dạng GIÁ TRỊ (không dùng "import type") vì ValidationPipe cần class thật lúc chạy để đọc decorator validate
// =============================================================================

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole, type Warehouse } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { QueryWarehousesDto } from './dto/query-warehouses.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehousesService } from './warehouses.service';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  // ==========================================================================
  // 1. XEM (ADMIN + WAREHOUSE_STAFF)
  // ==========================================================================

  // Danh sách kho. Tham số truy vấn (đều không bắt buộc):
  //   - includeInactive=true : Lấy cả kho đã ngừng hoạt động (chỉ Admin)
  //   - region=Miền Bắc      : Lọc theo khu vực (không phân biệt hoa thường)
  @Get()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  async findAll(
    @CurrentUser('role') role: UserRole,
    @CurrentUser('userId') userId: string,
    @Query() { includeInactive, region }: QueryWarehousesDto,
  ): Promise<Warehouse[]> {
    if (includeInactive && role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Chỉ Admin được xem kho đã ngừng hoạt động.',
      );
    }

    return this.warehousesService.findAll(
      { includeInactive, region },
      ...(role === UserRole.WAREHOUSE_STAFF ? [userId] : []),
    );
  }

  // Chi tiết 1 kho. Nhân viên kho chỉ xem được kho đang hoạt động
  // Kho đã ngừng hoạt động trả 404, như thể không tồn tại).
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  async findOne(
    @CurrentUser('role') role: UserRole,
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Warehouse> {
    return this.warehousesService.findOne(
      id,
      role === UserRole.ADMIN,
      ...(role === UserRole.WAREHOUSE_STAFF ? [userId] : []),
    );
  }

  // ==========================================================================
  // 2. GHI (CHỈ ADMIN)
  // ==========================================================================

  // Tạo kho mới.
  // Trả HTTP 201 cùng thông tin kho vừa tạo.
  // Trùng mã kho -> HTTP 409.
  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() input: CreateWarehouseDto): Promise<Warehouse> {
    return this.warehousesService.create(input);
  }

  // Cập nhật từng phần: chỉ các trường được gửi mới bị đổi
  // Dùng PUT theo hợp đồng API nhóm đã thống nhất.
  @Put(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateWarehouseDto,
    @CurrentUser('userId') actorId: string,
  ): Promise<Warehouse> {
    return this.warehousesService.update(id, input, actorId);
  }

  // "Xóa" kho = ngừng hoạt động (xóa mềm), KHÔNG xóa dữ liệu. Trả HTTP 204.
  // Bị từ chối (409) nếu kho còn tồn kho đang giữ chỗ cho đơn chưa hoàn tất.
  // Kích hoạt lại: PUT /warehouses/:id với { "isActive": true }.
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.warehousesService.deactivate(id);
  }
}
