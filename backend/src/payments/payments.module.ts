import { Module } from '@nestjs/common';
import { StockReservationModule } from '../stock-reservation/stock-reservation.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentGatewayService } from './mock-payment-gateway.service';
@Module({
  imports: [StockReservationModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPaymentGatewayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
