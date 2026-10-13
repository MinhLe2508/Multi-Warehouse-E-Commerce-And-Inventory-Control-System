import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user?: { id?: string };
}

// TODO: Thêm @UseGuards(JwtAuthGuard) khi Auth module sẵn sàng

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications
   * Lấy danh sách thông báo của user hiện tại.
   */
  @Get()
  async findAll(
    @Req() req: RequestWithUser,
    @Query() query: NotificationQueryDto,
  ) {
    // TODO: Lấy userId từ JWT payload khi tích hợp Auth guard
    const userId = req.user?.id ?? '';
    return this.notificationsService.findByUser(userId, query);
  }

  /**
   * GET /notifications/unread-count
   * Đếm thông báo chưa đọc.
   */
  @Get('unread-count')
  async countUnread(@Req() req: RequestWithUser) {
    const userId = req.user?.id ?? '';
    const count = await this.notificationsService.countUnread(userId);
    return { count };
  }

  /**
   * PATCH /notifications/:id/read
   * Đánh dấu 1 thông báo đã đọc.
   */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: RequestWithUser) {
    const userId = req.user?.id ?? '';
    await this.notificationsService.markAsRead(BigInt(id), userId);
    return { success: true };
  }

  /**
   * PATCH /notifications/read-all
   * Đánh dấu tất cả thông báo đã đọc.
   */
  @Patch('read-all')
  async markAllAsRead(@Req() req: RequestWithUser) {
    const userId = req.user?.id ?? '';
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }
}
