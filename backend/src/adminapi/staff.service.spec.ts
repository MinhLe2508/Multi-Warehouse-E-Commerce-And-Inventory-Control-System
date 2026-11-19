import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { type AuthService } from '../auth/auth.service';
import { type PrismaService } from '../prisma/prisma.service';
import { STAFF_MAX_OFFSET } from './dto/query-staff.dto';
import { StaffService } from './staff.service';

const staffId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const createdAt = new Date('2026-11-18T01:00:00.000Z');
const staffRow = {
  id: staffId,
  username: 'kho_test',
  email: 'staff@example.test',
  fullName: 'Nhân viên kho',
  phone: '0901234567',
  isActive: true,
  emailVerifiedAt: null,
  createdAt,
  updatedAt: createdAt,
  passwordHash: 'fixture-only',
  mustChangePassword: true,
};
const publicStaff = {
  id: staffId,
  username: staffRow.username,
  email: staffRow.email,
  fullName: staffRow.fullName,
  phone: staffRow.phone,
  status: 'PENDING_ACTIVATION',
  isActive: true,
  activatedAt: null,
  createdAt,
  updatedAt: createdAt,
};
const staffWhere = { id: staffId, role: UserRole.WAREHOUSE_STAFF };

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ isActive: true }]),
    user: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([staffRow]),
      findFirst: jest.fn().mockResolvedValue(staffRow),
      update: jest.fn().mockResolvedValue(staffRow),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    accountActionToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const prisma = {
    user: tx.user,
    $transaction: jest.fn(
      async (
        operation:
          Promise<unknown>[] | ((client: typeof tx) => Promise<unknown>),
      ) =>
        typeof operation === 'function'
          ? operation(tx)
          : Promise.all(operation),
    ),
  };
  const auth = {
    createStaff: jest.fn(),
    resendStaffInvitation: jest.fn().mockResolvedValue(undefined),
  };
  const service = new StaffService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
  );
  return { service, prisma, tx, auth };
}

describe('StaffService', () => {
  it('lists only warehouse staff with stable ordering and a public view', async () => {
    const { service, prisma, tx } = setup();
    await expect(service.findAll({ limit: 20, offset: 0 })).resolves.toEqual({
      items: [publicStaff],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const where = { role: UserRole.WAREHOUSE_STAFF };
    expect(tx.user.count).toHaveBeenCalledWith({ where });
    expect(tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it.each([
    ['ACTIVE', { isActive: true, emailVerifiedAt: { not: null } }],
    ['PENDING_ACTIVATION', { isActive: true, emailVerifiedAt: null }],
    ['LOCKED', { isActive: false }],
  ] as const)(
    'uses the same search and %s filter for count and page',
    async (status, filter) => {
      const { service, tx } = setup();
      const contains = { contains: 'Mã\\_1', mode: 'insensitive' };
      const where = {
        role: UserRole.WAREHOUSE_STAFF,
        ...filter,
        OR: [
          { fullName: contains },
          { email: contains },
          { username: contains },
          { phone: contains },
        ],
      };

      await service.findAll({
        search: '  Mã_1 ',
        status,
        limit: 10,
        offset: 20,
      });

      expect(tx.user.count).toHaveBeenCalledWith({ where });
      expect(tx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 20, take: 10 }),
      );
    },
  );

  it.each([
    { limit: 101, offset: 0 },
    { limit: 20, offset: -1 },
    { limit: 20, offset: STAFF_MAX_OFFSET + 1 },
  ])('rejects invalid pagination before querying: %j', async (query) => {
    const { service, prisma, tx } = setup();
    await expect(service.findAll(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.user.count).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 when there is no warehouse staff matching the id', async () => {
    const { service, tx } = setup();
    tx.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne(staffId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: staffWhere }),
    );
  });

  it.each([true, false])(
    'returns the confirmed new staff when invitationSent=%s',
    async (invitationSent) => {
      const { service, tx, auth } = setup();
      const input = { email: staffRow.email, fullName: staffRow.fullName };
      auth.createStaff.mockResolvedValueOnce({
        user: { id: staffId },
        invitationSent,
      });

      await expect(service.create(input, adminId)).resolves.toEqual({
        staff: publicStaff,
        invitationSent,
        message: expect.stringContaining(
          invitationSent ? 'gửi thư mời kích hoạt' : 'chưa gửi được thư mời',
        ) as string,
      });

      expect(auth.createStaff).toHaveBeenCalledWith(input);
      expect(tx.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: staffWhere }),
      );
    },
  );

  it('propagates a creation failure before a confirmed user exists', async () => {
    const { service, tx, auth } = setup();
    const error = new ServiceUnavailableException();
    auth.createStaff.mockRejectedValueOnce(error);

    await expect(
      service.create(
        { email: staffRow.email, fullName: staffRow.fullName },
        adminId,
      ),
    ).rejects.toBe(error);
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });

  it('trims a name and clears the phone in a role-scoped update', async () => {
    const { service, tx } = setup();
    tx.user.update.mockResolvedValueOnce({
      ...staffRow,
      fullName: 'Tên mới',
      phone: null,
    });
    await expect(
      service.update(
        staffId,
        { fullName: '  Tên mới  ', phone: null },
        adminId,
      ),
    ).resolves.toEqual({ ...publicStaff, fullName: 'Tên mới', phone: null });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: staffWhere,
        data: { fullName: 'Tên mới', phone: null },
      }),
    );
  });

  it('maps a missing scoped update to 404', async () => {
    const { service, tx } = setup();
    tx.user.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fixture missing row', {
        code: 'P2025',
        clientVersion: Prisma.prismaVersion.client,
      }),
    );
    await expect(
      service.update(staffId, { phone: null }, adminId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('locks the staff account and revokes both token kinds in the transaction', async () => {
    const { service, tx, prisma } = setup();
    tx.user.update.mockResolvedValueOnce({ ...staffRow, isActive: false });

    await expect(
      service.setStatus(staffId, { isActive: false }, adminId),
    ).resolves.toEqual({ ...publicStaff, status: 'LOCKED', isActive: false });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: staffWhere, data: { isActive: false } }),
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: staffId, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.accountActionToken.updateMany).toHaveBeenCalledWith({
      where: { userId: staffId, usedAt: null, invalidatedAt: null },
      data: { invalidatedAt: expect.any(Date) as Date },
    });
  });

  it('unlocks without changing the revoked or invalidated tokens', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ isActive: false }]);
    await expect(
      service.setStatus(staffId, { isActive: true }, adminId),
    ).resolves.toEqual(publicStaff);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.accountActionToken.updateMany).not.toHaveBeenCalled();
  });

  it('delegates resend by staff id and reports success only after delivery succeeds', async () => {
    const { service, auth } = setup();
    await expect(service.resendInvitation(staffId, adminId)).resolves.toEqual({
      invitationSent: true,
      message: 'Đã gửi lại thư mời kích hoạt.',
    });
    expect(auth.resendStaffInvitation).toHaveBeenCalledWith(staffId);

    for (const error of [
      new ConflictException(),
      new ServiceUnavailableException(),
    ]) {
      auth.resendStaffInvitation.mockRejectedValueOnce(error);
      await expect(service.resendInvitation(staffId, adminId)).rejects.toBe(
        error,
      );
    }
  });
});
