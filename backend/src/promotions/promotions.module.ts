import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CreatePromotionDto, PromotionQueryDto } from './promotions.dto';
import { PromotionsService } from './promotions.service';

@Controller('admin/promotions')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@Query() query: PromotionQueryDto) {
    return this.promotions.list(query);
  }

  @Post()
  create(@Body() dto: CreatePromotionDto) {
    return this.promotions.create(dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotions.remove(id);
  }
}

@Controller('promotions')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF)
class BuyerPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  available(@CurrentUser('userId') userId: string) {
    return this.promotions.available(userId);
  }

  @Post(':id/claim')
  claim(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.promotions.claim(userId, id);
  }
}

@Module({
  controllers: [AdminPromotionsController, BuyerPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
