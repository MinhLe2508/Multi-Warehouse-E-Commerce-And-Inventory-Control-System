// =============================================================================
// Nhiệm vụ
// - Admin xem danh sách/chi tiết nhân viên kho (WAREHOUSE_STAFF).
// - Admin tạo nhân viên, gửi thư mời kích hoạt qua AuthService.
// - Admin sửa họ tên, số điện thoại; khóa/mở khóa tài khoản.
// - Admin gửi lại thư mời cho nhân viên chưa kích hoạt.
//
// Nguyên tắc bảo mật
// 1. Chỉ truy vấn/thay đổi tài khoản role = WAREHOUSE_STAFF.
// 2. Không trả passwordHash, Refresh Token hoặc Action Token cho client.
// 3. Không tự tạo token, không gửi email trực tiếp: tái sử dụng AuthService.
// 4. Khóa tài khoản + thu hồi token trong cùng transaction PostgreSQL.
// 5. Không xóa cứng tài khoản để giữ lịch sử đơn hàng/nhật ký tồn kho.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type CreateStaffInput } from '../auth/auth.service';
import type { QueryStaffDto, StaffStatus } from './dto/query-staff.dto';
import type { UpdateStaffDto } from './dto/update-staff.dto';
import type { UpdateStaffStatusDto } from './dto/update-staff-status.dto';

// Chỉ đọc các cột được phép công khai qua API quản lý nhân viên
const STAFF_SELECT = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

// Lấy kiểu từ Prisma để tránh khai báo thủ công sai kiểu dữ liệu
type StaffRow = Prisma.UserGetPayload<{ select: typeof STAFF_SELECT }>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 150;
const MAX_REASON_LOG_LENGTH = 200;

// Thông tin Staff trả về cho Controller/Frontend; không chứa dữ liệu bí mật.
export interface StaffView {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: StaffStatus;
  isActive: boolean;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Kết quả danh sách có phân trang.
export interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Tài khoản vẫn được tạo ngay cả khi gửi thư mời gặp lỗi SMTP sau commit
export interface CreateStaffResult {
  staff: StaffView;
  invitationSent: boolean;
  message: string;
}

export interface ResendInvitationResult {
  invitationSent: true;
  message: string;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // ==========================================================================
  // 1. DANH SÁCH VÀ CHI TIẾT NHÂN VIÊN KHO
  // ==========================================================================

  // Xem danh sách Staff: tìm kiếm, lọc trạng thái, phân trang.
  // Count và danh sách đọc cùng snapshot để giảm chênh lệch khi có ghi đồng thời.
  async findAll(query: QueryStaffDto): Promise<PagedResult<StaffView>> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;

    // DTO ở Controller vẫn phải dùng @Type/@IsInt/@Min/@Max.
    // Kiểm tra thêm tại service để an toàn khi gọi từ code nội bộ.
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(`limit phải từ 1 đến ${MAX_LIMIT}.`);
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new BadRequestException('offset phải là số nguyên không âm.');
    }

    const where = this.buildWhere(query);
    const [total, rows] = await this.prisma.$transaction(
      [
        this.prisma.user.count({ where }),
        this.prisma.user.findMany({
          where,
          select: STAFF_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: offset,
          take: limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      items: rows.map((row) => this.toView(row)),
      total,
      limit,
      offset,
    };
  }

  // ID không thuộc Staff hoặc không tồn tại đều trả 404
  async findOne(id: string): Promise<StaffView> {
    this.assertStaffId(id);
    return this.toView(await this.findStaffRowOrThrow(id));
  }

  // ==========================================================================
  // 2. TẠO NHÂN VIÊN VÀ GỬI EMAIL KÍCH HOẠT
  // ==========================================================================

  // Khi chỉ gửi mail lỗi, tài khoản vẫn tồn tại.
  // Vì vậy API vẫn trả thông tin Staff kèm invitationSent=false để Admin có thể gửi lại thư mời.
  async create(
    input: CreateStaffInput,
    actorId: string,
  ): Promise<CreateStaffResult> {
    let createdId: string | null = null;
    let mailError: ServiceUnavailableException | null = null;

    try {
      const created = await this.authService.createStaff(input);
      createdId = created.id;
    } catch (error: unknown) {
      // Với AuthService hiện tại, 503 này được ném SAU KHI tạo User thành công,
      // khi MailService không gửi được thư mời.
      if (error instanceof ServiceUnavailableException) {
        mailError = error;
      } else {
        // Bao gồm lỗi email trùng (409) và các lỗi tạo User/token thực sự.
        throw error;
      }
    }

    // Thành công: tìm đúng ID vừa tạo.
    // Email thất bại: AuthService chưa trả ID nên tìm bằng email đã chuẩn hóa.
    const where: Prisma.UserWhereInput = createdId
      ? { id: createdId, role: UserRole.WAREHOUSE_STAFF }
      : {
          email: input.email.trim().toLowerCase(),
          role: UserRole.WAREHOUSE_STAFF,
        };

    const row = await this.prisma.user.findFirst({
      where,
      select: STAFF_SELECT,
    });

    if (!row) {
      // Không báo đã tạo thành công khi không thể xác nhận User trong DB.
      throw (
        mailError ??
        new ServiceUnavailableException(
          'Không thể xác nhận tài khoản nhân viên vừa được tạo.',
        )
      );
    }

    const staff = this.toView(row);

    if (mailError) {
      // Chỉ log ID; tuyệt đối không log token/URL kích hoạt.
      this.logger.warn(
        `Admin ${actorId} tạo Staff ${staff.id}, nhưng gửi thư mời thất bại.`,
      );
      return {
        staff,
        invitationSent: false,
        message:
          'Đã tạo nhân viên nhưng chưa gửi được thư mời. Hãy dùng chức năng gửi lại.',
      };
    }

    this.logger.log(`Admin ${actorId} đã tạo Staff ${staff.id}.`);
    return {
      staff,
      invitationSent: true,
      message: 'Đã tạo nhân viên và gửi thư mời kích hoạt.',
    };
  }

  // ==========================================================================
  // 3. CẬP NHẬT THÔNG TIN LIÊN HỆ
  // ==========================================================================

  // Chỉ cho sửa họ tên và/hoặc SĐT; phone=null nghĩa là xóa số.
  // Ràng buộc role NGAY TRONG WHERE của UPDATE để không gặp TOCTOU:
  // Staff bị đổi vai trò giữa lúc kiểm tra và ghi sẽ không bị cập nhật nhầm.
  async update(
    id: string,
    dto: UpdateStaffDto,
    actorId: string,
  ): Promise<StaffView> {
    this.assertStaffId(id);

    if (dto.fullName === undefined && dto.phone === undefined) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất họ tên hoặc số điện thoại để cập nhật.',
      );
    }

    const data: Prisma.UserUpdateInput = {};

    if (dto.fullName !== undefined) {
      if (typeof dto.fullName !== 'string') {
        throw new BadRequestException('Họ tên không hợp lệ.');
      }
      const fullName = dto.fullName.trim();
      if (!fullName || fullName.length > 150) {
        throw new BadRequestException('Họ tên phải có từ 1 đến 150 ký tự.');
      }
      data.fullName = fullName;
    }

    if (dto.phone !== undefined) {
      if (dto.phone === null) {
        data.phone = null;
      } else {
        if (typeof dto.phone !== 'string') {
          throw new BadRequestException('Số điện thoại không hợp lệ.');
        }
        const phone = dto.phone.trim();
        if (!/^(0\d{9}|\+84\d{9})$/.test(phone)) {
          throw new BadRequestException(
            'Số điện thoại phải có dạng 0xxxxxxxxx hoặc +84xxxxxxxxx; dùng Null để xóa.',
          );
        }
        data.phone = phone;
      }
    }

    try {
      const row = await this.prisma.user.update({
        where: { id, role: UserRole.WAREHOUSE_STAFF },
        data,
        select: STAFF_SELECT,
      });

      this.logger.log(`Admin ${actorId} cập nhật thông tin Staff ${id}.`);
      return this.toView(row);
    } catch (error: unknown) {
      // Prisma báo P2025 khi không có bản ghi thỏa WHERE.
      // Cùng kết quả 404 cho ID sai và ID của ADMIN/CUSTOMER.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Không tìm thấy nhân viên kho.');
      }
      throw error;
    }
  }

  // ==========================================================================
  // 4. KHÓA / MỞ KHÓA TÀI KHOẢN
  // ==========================================================================

  async setStatus(
    id: string,
    dto: UpdateStaffStatusDto,
    actorId: string,
  ): Promise<StaffView> {
    this.assertStaffId(id);

    if (typeof dto.isActive !== 'boolean') {
      throw new BadRequestException('isActive phải là boolean.');
    }

    const { row, changed, revokedCount, invalidatedCount } =
      await this.prisma.$transaction(async (tx) => {
        // Ràng buộc role ở SQL để tuyệt đối không khóa ADMIN/CUSTOMER.
        const locked = await tx.$queryRaw<Array<{ isActive: boolean }>>`
          SELECT "is_active" AS "isActive"
          FROM "users"
          WHERE "id" = ${id}::uuid
            AND "role"::text = 'WAREHOUSE_STAFF'
          FOR UPDATE
        `;

        if (locked.length === 0) {
          throw new NotFoundException('Không tìm thấy nhân viên kho.');
        }

        const changed = locked[0].isActive !== dto.isActive;
        let row: StaffRow;

        if (changed) {
          // Kiểm tra role lần nữa trong câu UPDATE để phòng vệ nhiều lớp.
          row = await tx.user.update({
            where: { id, role: UserRole.WAREHOUSE_STAFF },
            data: { isActive: dto.isActive },
            select: STAFF_SELECT,
          });
        } else {
          // Không UPDATE nếu trạng thái không đổi: tránh đổi updatedAt vô ích.
          const existing = await tx.user.findFirst({
            where: { id, role: UserRole.WAREHOUSE_STAFF },
            select: STAFF_SELECT,
          });
          if (!existing) {
            throw new NotFoundException('Không tìm thấy nhân viên kho.');
          }
          row = existing;
        }

        let revokedCount = 0;
        let invalidatedCount = 0;

        if (!dto.isActive) {
          const now = new Date();

          // Không cho Refresh Token cũ đổi sang Access Token mới.
          const refreshResult = await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: now },
          });
          revokedCount = refreshResult.count;

          // Hủy token thư mời, xác thực email, đặt lại mật khẩu chưa dùng.
          const actionResult = await tx.accountActionToken.updateMany({
            where: { userId: id, usedAt: null, invalidatedAt: null },
            data: { invalidatedAt: now },
          });
          invalidatedCount = actionResult.count;
        }

        return { row, changed, revokedCount, invalidatedCount };
      });

    if (changed || revokedCount > 0 || invalidatedCount > 0) {
      const action = dto.isActive ? 'MỞ KHÓA' : 'KHÓA';
      const reason =
        typeof dto.reason === 'string' ? this.sanitizeForLog(dto.reason) : '';
      this.logger.log(
        `Admin ${actorId} ${action} Staff ${id}` +
          (reason ? `; lý do: ${reason}` : '') +
          `; refreshToken thu hồi: ${revokedCount}; actionToken vô hiệu hóa: ${invalidatedCount}.`,
      );
    }

    return this.toView(row);
  }

  // ==========================================================================
  // 5. GỬI LẠI THƯ MỜI KÍCH HOẠT
  // ==========================================================================

  async resendInvitation(
    id: string,
    actorId: string,
  ): Promise<ResendInvitationResult> {
    this.assertStaffId(id);
    const row = await this.findStaffRowOrThrow(id);
    const status = this.computeStatus(row);

    if (status === 'LOCKED') {
      throw new ConflictException(
        'Tài khoản đang bị khóa. Hãy mở khóa trước khi gửi thư mời.',
      );
    }
    if (status === 'ACTIVE') {
      throw new ConflictException('Nhân viên đã kích hoạt tài khoản.');
    }

    // Không tạo hoặc log token tại StaffService.
    await this.authService.resendStaffInvitation(row.email);

    this.logger.log(
      `Admin ${actorId} đã yêu cầu gửi lại thư mời cho Staff ${id}.`,
    );
    return {
      invitationSent: true,
      message: 'Đã gửi lại thư mời kích hoạt.',
    };
  }

  // ==========================================================================
  // 6. HÀM DÙNG NỘI BỘ
  // ==========================================================================

  // Mọi truy vấn luôn gắn role Staff, kể cả khi lọc/tìm kiếm
  private buildWhere(query: QueryStaffDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      role: UserRole.WAREHOUSE_STAFF,
    };

    // Không để status lạ bị hiểu nhầm thành yêu cầu xem tất cả.
    if (
      query.status !== undefined &&
      !['ALL', 'LOCKED', 'PENDING_ACTIVATION', 'ACTIVE'].includes(query.status)
    ) {
      throw new BadRequestException('Trạng thái lọc nhân viên không hợp lệ.');
    }

    switch (query.status) {
      case 'LOCKED':
        where.isActive = false;
        break;
      case 'PENDING_ACTIVATION':
        where.isActive = true;
        where.emailVerifiedAt = null;
        break;
      case 'ACTIVE':
        where.isActive = true;
        where.emailVerifiedAt = { not: null };
        break;
      default:
        break;
    }

    if (query.search !== undefined) {
      if (typeof query.search !== 'string') {
        throw new BadRequestException('Từ khóa tìm kiếm không hợp lệ.');
      }
      const search = query.search.trim();
      if (search.length > MAX_SEARCH_LENGTH) {
        throw new BadRequestException(
          `Từ khóa tìm kiếm không được quá ${MAX_SEARCH_LENGTH} ký tự.`,
        );
      }
      if (search) {
        const escaped = search.replace(/[\\%_]/g, '\\$&');
        const contains = { contains: escaped, mode: 'insensitive' as const };
        where.OR = [
          { fullName: contains },
          { email: contains },
          { username: contains },
          { phone: contains },
        ];
      }
    }

    return where;
  }

  // Chỉ đọc User thuộc vai trò WAREHOUSE_STAFF
  private async findStaffRowOrThrow(id: string): Promise<StaffRow> {
    const row = await this.prisma.user.findFirst({
      where: { id, role: UserRole.WAREHOUSE_STAFF },
      select: STAFF_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy nhân viên kho.');
    }
    return row;
  }

  // Kiểm tra UUID trước khi dùng ::uuid trong raw SQL
  private assertStaffId(id: string): void {
    if (typeof id !== 'string' || !isUUID(id)) {
      throw new BadRequestException('ID nhân viên phải là UUID hợp lệ.');
    }
  }

  /** Suy ra trạng thái từ các trường hiện có của bảng users. */
  private computeStatus(row: StaffRow): StaffStatus {
    if (!row.isActive) return 'LOCKED';
    return row.emailVerifiedAt ? 'ACTIVE' : 'PENDING_ACTIVATION';
  }

  // Chuyển dữ liệu DB sang response an toàn cho Frontend.
  private toView(row: StaffRow): StaffView {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
      status: this.computeStatus(row),
      isActive: row.isActive,
      activatedAt: row.emailVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Bỏ ký tự điều khiển để người dùng không thể giả dòng trong log
  private sanitizeForLog(value: string): string {
    return value
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, MAX_REASON_LOG_LENGTH);
  }
}
