import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

// PricingService thuần tính toán (không dùng DB) nên module không cần PrismaModule.
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
