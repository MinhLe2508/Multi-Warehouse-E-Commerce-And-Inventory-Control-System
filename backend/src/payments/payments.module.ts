import { Module } from '@nestjs/common';
import { InventoryEventsModule } from '../inventory/inventory-events.module';
import { StockReservationModule } from '../stock-reservation/stock-reservation.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentGatewayService } from './mock-payment-gateway.service';
import { BankTransferService } from './bank-transfer.service';
@Module({
  imports: [StockReservationModule, InventoryEventsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPaymentGatewayService, BankTransferService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
