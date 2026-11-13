import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { LowStockNotifierService } from './low-stock-notifier.service';

// InventoryModule KHÔNG import ngược NotificationsModule nên không có vòng phụ thuộc.
// JwtModule: để Gateway xác thực Access Token (cùng secret với AuthModule).
@Module({
  imports: [
    InventoryModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret || !secret.trim()) {
          throw new Error('Thiếu JWT_ACCESS_SECRET.');
        }
        return { secret };
      },
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    LowStockNotifierService,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
