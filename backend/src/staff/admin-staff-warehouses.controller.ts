import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAssignmentsUpdate } from './staff-portal.dto';

@Controller('admin/staff/:id/warehouses')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminStaffWarehousesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async find(@Param('id', ParseUUIDPipe) id: string) {
    const staff = await this.prisma.user.findFirst({
      where: { id, role: UserRole.WAREHOUSE_STAFF },
      select: { warehouseAssignments: { select: { warehouseId: true } } },
    });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên kho.');
    return {
      warehouseIds: staff.warehouseAssignments.map(
        ({ warehouseId }) => warehouseId,
      ),
    };
  }

  @Put()
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: StaffAssignmentsUpdate,
  ) {
    const warehouseIds = [
      ...new Set(input.warehouseIds.map((value) => value.toLowerCase())),
    ].sort();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "users" WHERE "id" = ${id}::uuid AND "role" = 'WAREHOUSE_STAFF'
         FOR NO KEY UPDATE
      `;
      if (!user.length)
        throw new NotFoundException('Không tìm thấy nhân viên kho.');
      const count = await tx.warehouse.count({
        where: { id: { in: warehouseIds }, isActive: true },
      });
      if (count !== warehouseIds.length) {
        throw new BadRequestException('Chỉ có thể giao kho đang hoạt động.');
      }
      await tx.warehouseStaffAssignment.deleteMany({
        where: { userId: id, warehouseId: { notIn: warehouseIds } },
      });
      if (warehouseIds.length) {
        await tx.warehouseStaffAssignment.createMany({
          data: warehouseIds.map((warehouseId) => ({
            userId: id,
            warehouseId,
          })),
          skipDuplicates: true,
        });
      }
      return { warehouseIds };
    });
  }
}
