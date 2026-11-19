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
  UploadedFile,
  UseGuards,
  UseInterceptors,
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
import { PRODUCT_FORM_INTERCEPTORS } from './product-form.interceptors';
import {
  type ProductImageFile,
  ProductImagesService,
} from './product-images.service';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard, ProductAccountGuard)
@Roles(UserRole.ADMIN)
export class ManagedProductsController {
  constructor(
    private readonly products: ManagedProductsService,
    private readonly images: ProductImagesService,
  ) {}
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
  @UseInterceptors(...PRODUCT_FORM_INTERCEPTORS)
  create(
    @Body() input: CreateProductDto,
    @UploadedFile() image?: ProductImageFile,
  ) {
    return this.images.withUpload(image, (imageUrl) =>
      this.products.create(imageUrl ? { ...input, imageUrl } : input),
    );
  }
  @Patch(':id')
  @UseInterceptors(...PRODUCT_FORM_INTERCEPTORS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductDto,
    @UploadedFile() image?: ProductImageFile,
  ) {
    return this.images.withUpload(image, (imageUrl) =>
      this.products.update(id, imageUrl ? { ...input, imageUrl } : input),
    );
  }
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
