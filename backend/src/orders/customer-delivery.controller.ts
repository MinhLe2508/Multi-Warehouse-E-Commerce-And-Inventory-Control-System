import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CustomerDeliveryService } from './customer-delivery.service';
import { FavoriteAddressDto } from './dto/checkout.dto';

@Controller('customer')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF)
export class CustomerDeliveryController {
  constructor(private readonly delivery: CustomerDeliveryService) {}

  @Get('delivery')
  options(@CurrentUser('userId') userId: string) {
    return this.delivery.options(userId);
  }

  @Post('addresses')
  save(@CurrentUser('userId') userId: string, @Body() dto: FavoriteAddressDto) {
    return this.delivery.save(userId, dto);
  }

  @Patch('addresses/:id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FavoriteAddressDto,
  ) {
    return this.delivery.save(userId, dto, id);
  }

  @Delete('addresses/:id')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.delivery.remove(userId, id);
  }
}
