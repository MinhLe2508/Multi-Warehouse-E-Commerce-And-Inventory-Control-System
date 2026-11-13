import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export const LOW_STOCK_ALERT_EVENT = 'low_stock_alert';
export const ADMIN_ROOM = `role:${UserRole.ADMIN}`;

interface AccessTokenPayload {
  sub?: unknown;
  type?: unknown;
}

/**
 * WebSocket Gateway cho Notifications.
 * - Client kết nối tới namespace /notifications, gửi JWT Access Token trong
 *   `auth: { token }` của socket.io-client.
 * - Server xác thực JWT (cùng quy tắc với JwtStrategy: chữ ký, hạn, type=access,
 *   tài khoản còn hoạt động), KHÔNG tin role trong token mà đọc role mới nhất từ DB.
 * - Sau khi xác thực, client join room `userId` (thông báo cá nhân) và room
 *   `role:<ROLE>` (kênh theo vai trò, ví dụ Admin nhận low_stock_alert).
 * - Xác thực sai: gửi 'auth_error' rồi ngắt kết nối ngay.
 */
@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('Missing token');

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { algorithms: ['HS256'] },
      );
      if (
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        !isUUID(payload.sub)
      ) {
        throw new Error('Invalid token payload');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, isActive: true, emailVerifiedAt: true },
      });
      if (
        !user ||
        !user.isActive ||
        (user.role !== UserRole.ADMIN && user.emailVerifiedAt === null)
      ) {
        throw new Error('Invalid account');
      }

      Object.assign(client.data as object, {
        userId: user.id,
        role: user.role,
      });
      await client.join(user.id);
      await client.join(`role:${user.role}`);
      this.logger.log(`Client connected: ${client.id} user=${user.id}`);
    } catch {
      // Không lộ lý do chi tiết cho client.
      client.emit('auth_error', { message: 'Unauthorized' });
      client.disconnect(true);
      this.logger.warn(`Rejected unauthenticated socket: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Gửi thông báo real-time đến user cụ thể.
   */
  sendToUser(userId: string, payload: Record<string, unknown>) {
    this.server?.to(userId).emit('notification', payload);
  }

  /**
   * Đẩy sự kiện `low_stock_alert` cho mọi Admin đang online.
   */
  emitLowStockAlert(payload: Record<string, unknown>) {
    this.server?.to(ADMIN_ROOM).emit(LOW_STOCK_ALERT_EVENT, payload);
  }

  // Chỉ nhận token trong auth/header, KHÔNG nhận qua query string (tránh lộ token trong log).
  private extractToken(client: Socket): string | null {
    const authToken: unknown = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.replace(/^Bearer\s+/i, '');
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && /^Bearer\s+\S+$/i.test(header)) {
      return header.replace(/^Bearer\s+/i, '');
    }
    return null;
  }
}
