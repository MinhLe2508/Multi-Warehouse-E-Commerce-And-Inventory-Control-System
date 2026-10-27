// =============================================================================
// Các REST API quản lý TỒN KHO, gốc đường dẫn "/inventory":
//   GET   /inventory                Danh sách tồn kho (lọc, phân trang)  (ADMIN, WAREHOUSE_STAFF)
//   GET   /inventory/alerts         Danh sách cảnh báo tồn thấp          (ADMIN, WAREHOUSE_STAFF)
//   GET   /inventory/:id            Chi tiết 1 dòng tồn kho              (ADMIN, WAREHOUSE_STAFF)
//   POST  /inventory                Khai báo dòng tồn kho mới            (chỉ ADMIN)
//   POST  /inventory/:id/restock    Nhập thêm hàng                       (chỉ ADMIN)
//   PUT   /inventory/:id            Kiểm kê / điều chỉnh tồn, ngưỡng     (chỉ ADMIN)
//
// Phân quyền:
// - Không có endpoint công khai: khách hàng (CUSTOMER) không xem được tồn kho.
// - Việc hiển thị "còn hàng / hết hàng" cho khách thuộc module sản phẩm / đặt hàng.
// - Nhân viên kho chỉ được XEM; nhập hàng và điều chỉnh tồn là quyền riêng của Admin (quyết định thiết kế của nhóm).
// - Giá vốn (costPrice) chỉ Admin nhìn thấy, việc ẩn nằm trong InventoryService.
// - Guard gắn ở mức CLASS: JwtAuthGuard (xác thực) chạy trước RolesGuard (kiểm tra vai trò). Gắn trực tiếp nên đúng cả khi chưa đăng ký Guard toàn cục. 
// - Nếu sau này đăng ký APP_GUARD toàn cục, có thể bỏ @UseGuards ở đây để tránh xác thực hai lần.
//
// THỨ TỰ ROUTE: "alerts" PHẢI khai báo TRƯỚC ":id", nếu không "alerts" bị hiểu là một id và trả về lỗi 400 (id không hợp lệ).
// ID người thực hiện: luôn lấy từ token qua @CurrentUser('userId')
// Không bao giờ nhận từ body hay query để không ai mạo danh người khác trong nhật ký tồn kho.
// =============================================================================

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards, } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { QueryInventoryDto, QueryStockAlertsDto, } from './dto/query-inventory.dto';
import { RestockInventoryDto } from './dto/restock-inventory.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { InventoryService, type InventoryView, type PagedResult, type StockAlertView, } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ==========================================================================
  // 1. XEM (ADMIN + WAREHOUSE_STAFF)
  // ==========================================================================

  // Danh sách tồn kho. Tham số truy vấn (đều không bắt buộc): productId,
  // warehouseId, lowStockOnly, limit (mặc định 20, tối đa 100), offset.
  @Get()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  findAll(
    @Query() query: QueryInventoryDto,
    @CurrentUser('role') role: UserRole,
  ): Promise<PagedResult<InventoryView>> {
    return this.inventoryService.findAll(query, role);
  }

  // Danh sách cảnh báo tồn thấp. Tham số truy vấn (đều không bắt buộc):
  // status (OPEN | RESOLVED | ALL, mặc định OPEN), warehouseId, limit, offset.
  // Phải đứng TRƯỚC route ":id" (xem ghi chú đầu file).
  @Get('alerts')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  findAlerts(
    @Query() query: QueryStockAlertsDto,
    @CurrentUser('role') role: UserRole,
  ): Promise<PagedResult<StockAlertView>> {
    return this.inventoryService.findAlerts(query, role);
  }

  // Chi tiết một dòng tồn kho. Id là số nguyên dương (BIGINT) dạng chuỗi; id sai
  // định dạng -> 400, không tồn tại -> 404 (kiểm tra trong Service).
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  findOne(
    @Param('id') id: string,
    @CurrentUser('role') role: UserRole,
  ): Promise<InventoryView> {
    return this.inventoryService.findOne(id, role);
  }

  // ==========================================================================
  // 2. GHI (chỉ ADMIN)
  // ==========================================================================

  // Khai báo dòng tồn kho mới cho cặp (sản phẩm, kho). Trả HTTP 201.
  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() dto: CreateInventoryDto,
    @CurrentUser('userId') userId: string,
  ): Promise<InventoryView> {
    return this.inventoryService.create(dto, userId);
  }

  // Nhập THÊM hàng vào dòng tồn kho (cộng dồn). Đây là thao tác trên tài nguyên đã có chứ không tạo tài nguyên mới nên trả HTTP 200 thay vì 201.
  @Post(':id/restock')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  restock(
    @Param('id') id: string,
    @Body() dto: RestockInventoryDto,
    @CurrentUser('userId') userId: string,
  ): Promise<InventoryView> {
    return this.inventoryService.restock(id, dto, userId);
  }

  // Kiểm kê / điều chỉnh: đặt lại tồn vật lý và/hoặc đổi ngưỡng cảnh báo riêng.
  // Cập nhật từng phần: trường không gửi giữ nguyên.
  @Put(':id')
  @Roles(UserRole.ADMIN)
  updateStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
    @CurrentUser('userId') userId: string,
  ): Promise<InventoryView> {
    return this.inventoryService.updateStock(id, dto, userId);
  }
}