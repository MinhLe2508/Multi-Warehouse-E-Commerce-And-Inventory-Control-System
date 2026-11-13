import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

// Mọi endpoint yêu cầu đăng nhập; userId luôn lấy từ token, không nhận từ client.
// Không gắn @Roles: người dùng nào cũng đọc được thông báo CỦA CHÍNH MÌNH.
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications
   * Lấy danh sách thông báo của user hiện tại.
   */
  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.findByUser(userId, query);
  }

  /**
   * GET /notifications/unread-count
   * Đếm thông báo chưa đọc.
   */
  @Get('unread-count')
  async countUnread(@CurrentUser('userId') userId: string) {
    const count = await this.notificationsService.countUnread(userId);
    return { count };
  }

  /**
   * PATCH /notifications/read-all
   * Đánh dấu tất cả thông báo đã đọc.
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser('userId') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }

  /**
   * PATCH /notifications/:id/read
   * Đánh dấu 1 thông báo đã đọc. id không phải số -> 400; không phải của mình -> 404.
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!/^[1-9]\d{0,17}$/.test(id)) {
      throw new BadRequestException('ID thông báo không hợp lệ.');
    }
    const result = await this.notificationsService.markAsRead(
      BigInt(id),
      userId,
    );
    if (result.count === 0) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }
    return { success: true };
  }
}
