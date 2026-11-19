import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductAccountGuard } from './product-account.guard';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CreateProductDto, UpdateProductDto } from './dto/manage-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ManagedProductsService } from './managed-products.service';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard, ProductAccountGuard)
@Roles(UserRole.ADMIN)
export class ManagedProductsController {
  constructor(private readonly products: ManagedProductsService) {}
  @Get()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  list(@Query() query: ProductQueryDto, @CurrentUser('role') role: UserRole) {
    return this.products.list(query, role);
  }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.products.detail(id, role);
  }
  @Post()
  create(@Body() input: CreateProductDto) {
    return this.products.create(input);
  }
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductDto,
  ) {
    return this.products.update(id, input);
  }
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
