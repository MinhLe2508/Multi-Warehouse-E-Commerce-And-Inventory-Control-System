import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
  async findByUser(userId: string, query: NotificationQueryDto) {
    const where: Prisma.NotificationWhereInput = { userId };
    if (query.unreadOnly) {
      where.isRead = false;
    }

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
  async markAsRead(notificationId: bigint, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Đánh dấu tất cả thông báo của user là đã đọc.
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Đếm số thông báo chưa đọc của user.
   */
  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }
}
