import { Public } from '../core/decorators/public.decorator';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProductsService } from './products.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductImagesService } from './product-images.service';

@Public()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly images: ProductImagesService,
  ) {}

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  @Get('categories')
  categories() {
    return this.products.categories();
  }

  @Get('uploads/:filename')
  async image(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const image = await this.images.read(filename);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return image;
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.findOne(id);
  }
}
