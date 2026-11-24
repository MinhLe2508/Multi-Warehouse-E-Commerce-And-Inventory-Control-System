import { NotificationsGateway } from './notifications.gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function build(user: object | null, verify: jest.Mock) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(user && { sessionVersion: 0, ...user }),
    },
    warehouseStaffAssignment: { findMany: jest.fn().mockResolvedValue([]) },
  };
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
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
  return { gateway, client, emit, prisma };
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

  it('tài khoản chưa đổi mật khẩu lần đầu (mustChangePassword=true): ngắt kết nối', async () => {
    const { gateway, client } = build(
      {
        id: USER_ID,
        role: 'WAREHOUSE_STAFF',
        isActive: true,
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
      },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'access' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith('auth_error', {
      message: 'Unauthorized',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('refresh token (type != access): ngắt kết nối', async () => {
    const { gateway, client } = build(
      { id: USER_ID, role: 'ADMIN', isActive: true, emailVerifiedAt: null },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'refresh' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('từ chối phiên khách hàng cũ khi tài khoản đã thành nhân viên', async () => {
    const { gateway, client } = build(
      {
        id: USER_ID,
        role: 'WAREHOUSE_STAFF',
        isActive: true,
        emailVerifiedAt: new Date(),
        sessionVersion: 1,
      },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'access' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('CUSTOMER chỉ join room cá nhân userId, KHÔNG được join room quản trị (role:ADMIN / role:WAREHOUSE_STAFF)', async () => {
    const { gateway, client } = build(
      {
        id: USER_ID,
        role: 'CUSTOMER',
        isActive: true,
        emailVerifiedAt: new Date(),
        mustChangePassword: false,
      },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'access' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith(USER_ID);
    expect(client.join).not.toHaveBeenCalledWith('role:ADMIN');
    expect(client.join).not.toHaveBeenCalledWith('role:WAREHOUSE_STAFF');
    expect(client.join).not.toHaveBeenCalledWith('role:CUSTOMER');
  });

  it('emitLowStockAlert chỉ gửi vào room Admin và loại bỏ costPrice', () => {
    const { gateway, emit } = build(null, jest.fn());
    gateway.emitLowStockAlert({
      a: 1,
      costPrice: '150000.00',
      productCostPrice: '150000.00',
    });
    expect(
      ((gateway.server.to as jest.Mock).mock.calls as string[][])[0][0],
    ).toBe('role:ADMIN');
    expect(emit).toHaveBeenCalledWith('low_stock_alert', { a: 1 });
  });

  it('gửi biến động cho Admin và nhân viên được giao kho, bỏ giá vốn', async () => {
    const { gateway, emit, prisma } = build(null, jest.fn());
    const warehouseId = '22222222-2222-4222-8222-222222222222';
    prisma.warehouseStaffAssignment.findMany.mockResolvedValue([
      { userId: USER_ID, user: { sessionVersion: 2 } },
    ]);
    gateway.emitInventoryChanged({
      inventoryId: '10',
      warehouseId,
      stock: 20,
      reservedStock: 2,
      availableStock: 18,
      costPrice: '99999.00',
    });
    await Promise.resolve();
    const rooms = (
      (gateway.server.to as jest.Mock).mock.calls as string[][]
    ).map((c) => c[0]);
    expect(rooms).toEqual(['role:ADMIN', [`staff:${USER_ID}:2`]]);
    expect(rooms).not.toContain('role:CUSTOMER');
    expect(emit).toHaveBeenCalledWith('inventory.changed', {
      inventoryId: '10',
      warehouseId,
      stock: 20,
      reservedStock: 2,
      availableStock: 18,
    });
  });

  it('reauthenticate: rời room tài khoản/vai trò cũ khi đổi phiên sang tài khoản khác', async () => {
    const OTHER_ID = '22222222-2222-4222-8222-222222222222';
    const verify = jest
      .fn()
      .mockResolvedValueOnce({ sub: USER_ID, type: 'access' })
      .mockResolvedValueOnce({ sub: OTHER_ID, type: 'access' });
    const { gateway, client, prisma } = build(
      { id: USER_ID, role: 'ADMIN', isActive: true, emailVerifiedAt: null },
      verify,
    );

    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith(USER_ID);
    expect(client.join).toHaveBeenCalledWith('role:ADMIN');

    prisma.user.findUnique.mockResolvedValueOnce({
      id: OTHER_ID,
      role: 'CUSTOMER',
      isActive: true,
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
      sessionVersion: 0,
    });

    const ok = await gateway.reauthenticate(client as never, 'Bearer new-tok');
    expect(ok).toBe(true);
    expect(client.leave).toHaveBeenCalledWith(USER_ID);
    expect(client.leave).toHaveBeenCalledWith('role:ADMIN');
    expect(client.join).toHaveBeenCalledWith(OTHER_ID);
  });
});
