import { NotificationsGateway } from './notifications.gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function build(user: object | null, verify: jest.Mock) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const gateway = new NotificationsGateway(
    { verifyAsync: verify } as never,
    prisma as never,
  );
  const emit = jest.fn();
  gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;
  const client = {
    id: 'c1',
    data: {} as Record<string, unknown>,
    handshake: { auth: { token: 'tok' }, headers: {} },
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
  return { gateway, client, emit };
}

describe('NotificationsGateway', () => {
  it('JWT hợp lệ: join room userId và room role', async () => {
    const { gateway, client } = build(
      { id: USER_ID, role: 'ADMIN', isActive: true, emailVerifiedAt: null },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'access' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith(USER_ID);
    expect(client.join).toHaveBeenCalledWith('role:ADMIN');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('token sai chữ ký/hết hạn: ngắt kết nối', async () => {
    const { gateway, client } = build(
      null,
      jest.fn().mockRejectedValue(new Error('x')),
    );
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('tài khoản bị khóa: ngắt kết nối', async () => {
    const { gateway, client } = build(
      { id: USER_ID, role: 'ADMIN', isActive: false, emailVerifiedAt: null },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'access' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refresh token (type != access): ngắt kết nối', async () => {
    const { gateway, client } = build(
      { id: USER_ID, role: 'ADMIN', isActive: true, emailVerifiedAt: null },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'refresh' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('emitLowStockAlert chỉ gửi vào room Admin', () => {
    const { gateway, emit } = build(null, jest.fn());
    gateway.emitLowStockAlert({ a: 1 });
    expect(
      ((gateway.server.to as jest.Mock).mock.calls as string[][])[0][0],
    ).toBe('role:ADMIN');
    expect(emit).toHaveBeenCalledWith('low_stock_alert', { a: 1 });
  });
});
