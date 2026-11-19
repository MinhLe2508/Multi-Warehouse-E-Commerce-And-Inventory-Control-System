import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { InventoryModule } from './inventory.module';
import { InventoryChangeEmitter } from './inventory-change-emitter.service';
import { InventoryPubSubService } from './inventory-pubsub.service';
import { InventoryAlertService } from './inventory-alert.service';

describe('Shared inventory event providers', () => {
  it('wires transaction owners without a NotificationsModule cycle', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InventoryModule,
        OrdersModule,
        PaymentsModule,
        WarehousesModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(moduleRef.get(InventoryChangeEmitter)).toBeInstanceOf(
      InventoryChangeEmitter,
    );
    expect(moduleRef.get(InventoryPubSubService)).toBeInstanceOf(
      InventoryPubSubService,
    );
    expect(moduleRef.get(InventoryAlertService)).toBeInstanceOf(
      InventoryAlertService,
    );
    await moduleRef.close();
  });
});
