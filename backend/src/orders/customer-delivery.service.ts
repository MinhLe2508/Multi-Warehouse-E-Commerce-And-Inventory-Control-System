import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FavoriteAddress } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { FavoriteAddressDto } from './dto/checkout.dto';

@Injectable()
export class CustomerDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async options(userId: string) {
    const [warehouses, addresses, lastOrder] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true, region: true },
      }),
      this.prisma.favoriteAddress.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.order.findFirst({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          shippingRecipient: true,
          shippingPhone: true,
          shippingAddress: true,
          shippingWarehouseId: true,
        },
      }),
    ]);
    const active = new Set(warehouses.map(({ id }) => id));
    return {
      warehouses,
      addresses: addresses.map((row) => ({
        ...this.serialize(row),
        shippingWarehouseId:
          row.warehouseId && active.has(row.warehouseId)
            ? row.warehouseId
            : null,
      })),
      lastOrder: lastOrder
        ? {
            ...lastOrder,
            shippingWarehouseId:
              lastOrder.shippingWarehouseId &&
              active.has(lastOrder.shippingWarehouseId)
                ? lastOrder.shippingWarehouseId
                : null,
          }
        : null,
    };
  }

  async save(userId: string, dto: FavoriteAddressDto, id?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (
        id &&
        !(await tx.favoriteAddress.findUnique({
          where: { id, userId },
          select: { id: true },
        }))
      ) {
        throw new NotFoundException('Không tìm thấy địa chỉ yêu thích.');
      }
      if (
        dto.shippingWarehouseId &&
        !(await tx.warehouse.findUnique({
          where: { id: dto.shippingWarehouseId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw new BadRequestException('Kho giao hàng không còn hoạt động.');
      }
      if (dto.isDefault) {
        await tx.favoriteAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const values = {
        label: dto.label,
        recipient: dto.shippingRecipient,
        phone: dto.shippingPhone,
        address: dto.shippingAddress,
        warehouseId: dto.shippingWarehouseId ?? null,
        isDefault: dto.isDefault ?? undefined,
      };
      const row = id
        ? await tx.favoriteAddress.update({
            where: { id, userId },
            data: values,
          })
        : await tx.favoriteAddress.create({ data: { ...values, userId } });
      return this.serialize(row);
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.favoriteAddress.deleteMany({
      where: { id, userId },
    });
    if (!result.count)
      throw new NotFoundException('Không tìm thấy địa chỉ yêu thích.');
    return { removed: true };
  }

  private serialize(row: FavoriteAddress) {
    return {
      id: row.id,
      label: row.label,
      isDefault: row.isDefault,
      shippingRecipient: row.recipient,
      shippingPhone: row.phone,
      shippingAddress: row.address,
      shippingWarehouseId: row.warehouseId,
    };
  }
}
