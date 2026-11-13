// =============================================================================
// Cung cấp REST API để ADMIN quản lý tài khoản nhân viên kho.
// Controller CHỈ tiếp nhận request, kiểm tra quyền/đầu vào và gọi StaffService.
// Không truy vấn Prisma, không gửi email, không tạo token tại đây.
//
// DANH SÁCH API (chỉ dành cho ADMIN)
// GET   /admin/staff                        Danh sách, tìm kiếm, lọc, phân trang
// GET   /admin/staff/:id                    Chi tiết một nhân viên kho
// POST  /admin/staff                        Tạo nhân viên + gửi thư mời (201)
// PATCH /admin/staff/:id                    Sửa một phần họ tên / số điện thoại
// PATCH /admin/staff/:id/status             Khóa hoặc mở khóa tài khoản
// POST  /admin/staff/:id/resend-invitation  Gửi lại thư mời kích hoạt (200)
//
// BẢO MẬT
// 1. JwtAuthGuard: xác minh Access Token (không có/sai token => 401).
// 2. PasswordChangedGuard: buộc tài khoản đã hoàn tất đổi mật khẩu lần đầu.
// 3. RolesGuard + @Roles(ADMIN): từ chối vai trò không phải ADMIN (403).
// 4. @CurrentUser('userId'): lấy ID Admin từ JWT đã xác minh; không lấy từ body.
// 5. ParseUUIDPipe: từ chối ID sai UUID v4 trước khi gọi StaffService (400).
// 6. StaffService luôn lọc role = WAREHOUSE_STAFF trong truy vấn CSDL.
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

// Các decorator/guard sử dụng chung cho toàn bộ backend.
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';

// IMPORT DẠNG GIÁ TRỊ: ValidationPipe cần class DTO tại runtime.
import { CreateStaffDto } from '../auth/dto/create-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';

import { StaffService } from './staff.service';
import type {
  CreateStaffResult,
  PagedResult,
  ResendInvitationResult,
  StaffView,
} from './staff.service';

// Kiểm tra ID theo UUID v4 (phù hợp gen_random_uuid() trong schema PostgreSQL).
// Dùng thông báo tiếng Việt để Frontend hiển thị dễ hiểu.
const staffIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException('ID nhân viên không đúng định dạng UUID v4.'),
});

@Controller('admin/staff')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // ==========================================================================
  // 1. LẤY DANH SÁCH NHÂN VIÊN KHO
  // ==========================================================================

  // Chỉ nhân viên có role WAREHOUSE_STAFF được trả về.
  @Get()
  findAll(@Query() query: QueryStaffDto): Promise<PagedResult<StaffView>> {
    return this.staffService.findAll(query);
  }

  // ==========================================================================
  // 2. XEM CHI TIẾT MỘT NHÂN VIÊN KHO
  // ==========================================================================

  @Get(':id')
  findOne(@Param('id', staffIdPipe) id: string): Promise<StaffView> {
    return this.staffService.findOne(id);
  }

  // ==========================================================================
  // 3. TẠO NHÂN VIÊN MỚI VÀ GỬI THƯ MỜI
  // ==========================================================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateStaffDto,
    @CurrentUser('userId') actorId: string,
  ): Promise<CreateStaffResult> {
    return this.staffService.create(dto, actorId);
  }

  // ==========================================================================
  // 4. CẬP NHẬT MỘT PHẦN THÔNG TIN NHÂN VIÊN
  // ==========================================================================

  @Patch(':id')
  update(
    @Param('id', staffIdPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser('userId') actorId: string,
  ): Promise<StaffView> {
    return this.staffService.update(id, dto, actorId);
  }

  // ==========================================================================
  // 5. KHÓA / MỞ KHÓA TÀI KHOẢN NHÂN VIÊN
  // ==========================================================================

  @Patch(':id/status')
  setStatus(
    @Param('id', staffIdPipe) id: string,
    @Body() dto: UpdateStaffStatusDto,
    @CurrentUser('userId') actorId: string,
  ): Promise<StaffView> {
    return this.staffService.setStatus(id, dto, actorId);
  }

  // ==========================================================================
  // 6. GỬI LẠI THƯ MỜI KÍCH HOẠT
  // ==========================================================================

  @Post(':id/resend-invitation')
  @HttpCode(HttpStatus.OK)
  resendInvitation(
    @Param('id', staffIdPipe) id: string,
    @CurrentUser('userId') actorId: string,
  ): Promise<ResendInvitationResult> {
    return this.staffService.resendInvitation(id, actorId);
  }
}
