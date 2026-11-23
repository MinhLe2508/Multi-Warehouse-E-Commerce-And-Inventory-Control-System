import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { staffWarehouseWhere } from '../staff/warehouse-scope';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private visible(
    userId: string,
    role?: UserRole,
    scope?: string,
  ): Prisma.NotificationWhereInput {
    const personal: Prisma.NotificationWhereInput = {
      type: { in: ['SYSTEM', 'ORDER_UPDATE'] }, warehouseId: null,
    };
    if (role === UserRole.CUSTOMER || scope === 'shopping') {
      return { userId, warehouseId: null, type: { in: ['SYSTEM', 'ORDER_UPDATE', 'PROMOTION'] } };
    }
    return {
      userId,
      ...(role === UserRole.WAREHOUSE_STAFF
        ? {
            OR: [
              personal,
              { warehouse: staffWarehouseWhere(userId) },
            ],
          }
        : {}),
    };
  }

  /**
   * Tạo thông báo mới và lưu vào DB.
   * Sau khi tạo, có thể emit qua WebSocket (gateway) để push real-time.
   */
  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
      },
    });

    this.logger.log(
      `Notification created: id=${notification.id} type=${dto.type} user=${dto.userId}`,
    );

    return notification;
  }

  /**
   * Lấy danh sách thông báo của user, hỗ trợ phân trang và lọc unread.
   */
  async findByUser(
    userId: string,
    query: NotificationQueryDto,
    role?: UserRole,
  ) {
    const where = this.visible(userId, role, query.scope);
    if (query.type) where.AND = { type: query.type };
    if (query.unreadOnly) {
      where.isRead = false;
    }

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Đánh dấu 1 thông báo đã đọc.
   */
  async markAsRead(notificationId: bigint, userId: string, role?: UserRole) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        OR: [this.visible(userId, role), this.visible(userId, role, 'shopping')],
      },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Đánh dấu tất cả thông báo của user là đã đọc.
   */
  async markAllAsRead(userId: string, role?: UserRole, scope?: string) {
    return this.prisma.notification.updateMany({
      where: { ...this.visible(userId, role, scope), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Đếm số thông báo chưa đọc của user.
   */
  async countUnread(userId: string, role?: UserRole, scope?: string): Promise<number> {
    return this.prisma.notification.count({
      where: { ...this.visible(userId, role, scope), isRead: false },
    });
  }
}
