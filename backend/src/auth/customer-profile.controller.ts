import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const buyerRoles = [UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF];

class CustomerProfileDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @Transform(trim)
  @IsString()
  @Matches(/^(?:\+?[0-9]{9,15})?$/, {
    message: 'Số điện thoại phải gồm 9–15 chữ số.',
  })
  phone: string;

  @Transform(trim)
  @IsString()
  @MaxLength(500)
  address: string;
}

@Controller('customer/profile')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF)
export class CustomerProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async profile(@CurrentUser('userId') id: string) {
    const select = {
      id: true,
      fullName: true,
      username: true,
      email: true,
      phone: true,
      address: true,
      avatarUrl: true,
      emailVerifiedAt: true,
      isActive: true,
      createdAt: true,
    } satisfies Prisma.UserSelect;
    const profile = await this.prisma.user.findFirst({
      where: { id, role: { in: buyerRoles }, isActive: true },
      select,
    });
    if (!profile) throw new NotFoundException('Không tìm thấy tài khoản.');
    return profile;
  }

  @Patch()
  async save(
    @CurrentUser('userId') id: string,
    @Body() input: CustomerProfileDto,
  ) {
    const result = await this.prisma.user.updateMany({
      where: { id, role: { in: buyerRoles }, isActive: true },
      data: {
        fullName: input.fullName,
        phone: input.phone || null,
        address: input.address || null,
      },
    });
    if (!result.count) throw new NotFoundException('Không tìm thấy tài khoản.');
    return this.profile(id);
  }
}
