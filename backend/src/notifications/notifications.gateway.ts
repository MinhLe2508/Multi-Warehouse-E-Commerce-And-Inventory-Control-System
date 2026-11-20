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
export const INVENTORY_CHANGED_EVENT = 'inventory.changed';
export const ADMIN_ROOM = `role:${UserRole.ADMIN}`;

const FORBIDDEN_BROADCAST_FIELDS = new Set([
  'costPrice',
  'productCostPrice',
  'passwordHash',
  'refreshToken',
  'tokenHash',
]);

function stripSensitiveFields(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_BROADCAST_FIELDS.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = stripSensitiveFields(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

interface AccessTokenPayload {
  sub?: unknown;
  type?: unknown;
  exp?: unknown;
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
  private readonly expiryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('Missing token');

      await this.authenticateAndAssignRooms(client, token);
      this.logger.log(
        `Client connected: ${client.id} user=${String((client.data as Record<string, unknown>).userId)}`,
      );
    } catch {
      this.clearExpiryTimer(client.id);
      // Không lộ lý do chi tiết cho client.
      client.emit('auth_error', { message: 'Unauthorized' });
      client.disconnect(true);
      this.logger.warn(`Rejected unauthenticated socket: ${client.id}`);
    }
  }

  /**
   * Hỗ trợ làm mới token hoặc xác thực lại khi đổi phiên / đổi trạng thái tài khoản mà không rò rỉ room cũ.
   */
  async reauthenticate(client: Socket, rawToken?: string): Promise<boolean> {
    try {
      const token =
        typeof rawToken === 'string' && rawToken.trim().length > 0
          ? rawToken.replace(/^Bearer\s+/i, '').trim()
          : this.extractToken(client);
      if (!token) throw new Error('Missing token');

      await this.authenticateAndAssignRooms(client, token);
      return true;
    } catch {
      this.clearExpiryTimer(client.id);
      client.emit('auth_error', { message: 'Unauthorized' });
      client.disconnect(true);
      return false;
    }
  }

  handleDisconnect(client: Socket) {
    this.clearExpiryTimer(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Gửi thông báo real-time đến user cụ thể (loại bỏ các trường nhạy cảm).
   */
  sendToUser(userId: string, payload: Record<string, unknown>) {
    this.server?.to(userId).emit('notification', stripSensitiveFields(payload));
  }

  /**
   * Đẩy cảnh báo tới Admin và nhân viên của kho liên quan.
   */
  emitLowStockAlert(payload: Record<string, unknown>) {
    const clean = stripSensitiveFields(payload);
    this.server?.to(ADMIN_ROOM).emit(LOW_STOCK_ALERT_EVENT, clean);
    this.emitToAssignedStaff(LOW_STOCK_ALERT_EVENT, clean);
  }

  /**
   * Đẩy sự kiện `inventory.changed` sau commit cho ADMIN và WAREHOUSE_STAFF (không gửi cho CUSTOMER, không mang costPrice).
   */
  emitInventoryChanged(payload: Record<string, unknown>) {
    const clean = stripSensitiveFields(payload);
    this.server?.to(ADMIN_ROOM).emit(INVENTORY_CHANGED_EVENT, clean);
    this.emitToAssignedStaff(INVENTORY_CHANGED_EVENT, clean);
  }

  private emitToAssignedStaff(event: string, payload: Record<string, unknown>) {
    const warehouseId = payload.warehouseId;
    if (!this.server || typeof warehouseId !== 'string' || !isUUID(warehouseId))
      return;
    void this.prisma.warehouseStaffAssignment
      .findMany({
        where: {
          warehouseId,
          warehouse: { isActive: true },
          user: {
            role: UserRole.WAREHOUSE_STAFF,
            isActive: true,
            emailVerifiedAt: { not: null },
            mustChangePassword: false,
          },
        },
        select: { userId: true },
      })
      .then((recipients) => {
        if (recipients.length)
          this.server
            ?.to(recipients.map(({ userId }) => userId))
            .emit(event, payload);
      })
      .catch(() =>
        this.logger.warn('Không gửi được thông báo kho tới nhân viên.'),
      );
  }

  private async authenticateAndAssignRooms(
    client: Socket,
    token: string,
  ): Promise<void> {
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
    if (
      payload.exp !== undefined &&
      (typeof payload.exp !== 'number' ||
        !Number.isFinite(payload.exp) ||
        payload.exp * 1000 <= Date.now())
    ) {
      throw new Error('Expired token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        mustChangePassword: true,
      },
    });
    if (
      !user ||
      !user.isActive ||
      user.mustChangePassword === true ||
      (user.role !== UserRole.ADMIN && user.emailVerifiedAt === null)
    ) {
      throw new Error('Invalid account');
    }

    const prevData = (client.data ?? {}) as {
      userId?: string;
      role?: UserRole;
    };
    if (prevData.userId && prevData.userId !== user.id) {
      await client.leave?.(prevData.userId);
    }
    if (prevData.role && prevData.role !== user.role) {
      await client.leave?.(`role:${prevData.role}`);
    }

    Object.assign(client.data as object, {
      userId: user.id,
      role: user.role,
    });
    await client.join(user.id);

    if (user.role === UserRole.ADMIN) {
      await client.join(ADMIN_ROOM);
    } else {
      await client.leave?.(ADMIN_ROOM);
    }

    this.scheduleExpiryDisconnect(
      client,
      typeof payload.exp === 'number' ? payload.exp : undefined,
    );
  }

  private scheduleExpiryDisconnect(client: Socket, expSeconds?: number): void {
    this.clearExpiryTimer(client.id);
    if (typeof expSeconds !== 'number' || !Number.isFinite(expSeconds)) return;
    const remainingMs = Math.min(2_147_483_647, expSeconds * 1000 - Date.now());
    if (remainingMs <= 0) {
      client.emit('auth_error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }
    const timer = setTimeout(() => {
      this.expiryTimers.delete(client.id);
      client.emit('auth_error', { message: 'Unauthorized' });
      client.disconnect(true);
    }, remainingMs);
    timer.unref?.();
    this.expiryTimers.set(client.id, timer);
  }

  private clearExpiryTimer(clientId: string): void {
    const existing = this.expiryTimers.get(clientId);
    if (existing) {
      clearTimeout(existing);
      this.expiryTimers.delete(clientId);
    }
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
