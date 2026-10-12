import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket Gateway cho Notifications.
 * - Client kết nối tới namespace /notifications
 * - Sau khi xác thực, client join vào room = userId
 * - Server emit event 'notification' vào room tương ứng khi có thông báo mới
 *
 * TODO: Thêm xác thực JWT trong handleConnection khi Auth module sẵn sàng.
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

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    // TODO: Xác thực JWT từ handshake headers/query
    // const token = client.handshake.auth?.token;
    // const userId = verifyAndExtract(token);
    // client.join(userId);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Gửi thông báo real-time đến user cụ thể.
   * Được gọi từ NotificationsService sau khi tạo notification thành công.
   */
  sendToUser(userId: string, payload: Record<string, unknown>) {
    this.server.to(userId).emit('notification', payload);
  }
}
