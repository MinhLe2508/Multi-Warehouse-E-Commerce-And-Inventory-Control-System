/**
  Quản lý vòng đời của Token hành động tài khoản:
  1. EMAIL_VERIFICATION:
     Customer xác thực Gmail và tự thiết lập mật khẩu.
     Thời hạn mặc định: 60 giây.
 
  2. STAFF_INVITATION:
     Staff do Admin tạo, nhận email mời và tự thiết lập mật khẩu.
     Thời hạn mặc định: 60 giây.
 
  3. PASSWORD_RESET:
     Người dùng quên mật khẩu, nhận email và tự đặt mật khẩu mới.
     Thời hạn mặc định: 900 giây (15 phút).

  NGUYÊN TẮC BẢO MẬT:
  - Sinh token bằng crypto.randomBytes(32).
  - Chỉ lưu SHA-256 hash trong PostgreSQL.
  - Không lưu hoặc ghi log token gốc.
  - Token có thời hạn và chỉ được sử dụng một lần.
  - Token chỉ hợp lệ cho đúng mục đích đã tạo.
  - Tạo token mới sẽ vô hiệu hóa token cũ cùng User/purpose.
  - Chống race condition bằng transaction và row locking.
  - Việc tiêu thụ token phải nằm cùng transaction với hành động nghiệp vụ do AuthService thực hiện.
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { AccountActionPurpose, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Kết quả khi tạo một token hành động thành công.
export interface CreatedActionToken {
  rawToken: string; // Token gốc, chỉ trả cho AuthService để tạo link gửi email. Không lưu vào database hoặc ghi log.
  expiresAt: Date; // Thời điểm token hết hạn.
}

// Kết quả khi tiêu thụ token thành công.
// AuthService sử dụng kết quả này để thực hiện nghiệp vụ tương ứng trong cùng transaction.
export interface ConsumeTokenResult {
  userId: string; // ID của tài khoản sở hữu token.
  purpose: AccountActionPurpose; // Mục đích mà token được phát hành.
}

// CẤU HÌNH THỜI HẠN TOKEN
// Cấu hình TTL theo từng loại token.
const TOKEN_TTL_CONFIG: Record<
  AccountActionPurpose,
  {
    envName: string; // Tên biến môi trường cần đọc.
    defaultSeconds: number; // Thời gian mặc định nếu biến môi trường chưa được khai báo.
  }
> = {
  [AccountActionPurpose.EMAIL_VERIFICATION]: {
    envName: 'EMAIL_VERIFICATION_TTL_SECONDS',
    defaultSeconds: 60,
  },

  [AccountActionPurpose.STAFF_INVITATION]: {
    envName: 'STAFF_INVITATION_TTL_SECONDS',
    defaultSeconds: 60,
  },

  [AccountActionPurpose.PASSWORD_RESET]: {
    envName: 'PASSWORD_RESET_TTL_SECONDS',
    defaultSeconds: 900,
  },
};

// Định dạng token do hệ thống tự tạo:
// Kiểm tra định dạng trước khi hash giúp từ chối sớm các giá trị không hợp lệ nhận từ request.
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

// ACCOUNT ACTION TOKEN SERVICE
@Injectable()
export class AccountActionTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   LUỒNG XỬ LÝ:
    1. Khóa dòng User bằng SELECT ... FOR UPDATE.
    2. Sinh token ngẫu nhiên và tính SHA-256 hash.
    3. Vô hiệu hóa token cũ cùng User và purpose.
    4. Tính thời gian hết hạn theo cấu hình TTL.
    5. Lưu tokenHash và expiresAt vào PostgreSQL.
    6. Trả rawToken cho AuthService để gửi email.
   */
  // Tạo token mới cho một User và một purpose cụ thể.
  // Transaction thứ hai chỉ tiếp tục sau khi transaction thứ nhất hoàn thành.
  async createToken(
    userId: string,
    purpose: AccountActionPurpose,
    tx?: Prisma.TransactionClient,
  ): Promise<CreatedActionToken> {
    // Kiểm tra UUID trước khi sử dụng trong câu SQL khóa dòng.
    // User ID phải là UUID do Prisma/PostgreSQL quản lý.
    if (
      typeof userId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId,
      )
    ) {
      throw new BadRequestException('User ID không hợp lệ.');
    }

    // Đọc TTL và kiểm tra cấu hình trước khi tạo token.
    const ttlSeconds = this.getTtlSeconds(purpose);

    const createWithinTransaction = async (
      client: Prisma.TransactionClient,
    ): Promise<CreatedActionToken> => {
      // Khóa dòng User.
      const userExists = await this.lockUser(client, userId);

      if (!userExists) {
        throw new NotFoundException('Không tìm thấy tài khoản cần tạo Token.');
      }

      // Sinh 32 byte ngẫu nhiên, mã hóa thành hex
      const rawToken = randomBytes(32).toString('hex');

      // Băm token trước khi lưu database.
      const tokenHash = this.hashToken(rawToken);

      // Tính thời gian sau khi đã lấy được khóa User.
      // Tránh làm mất TTL trong thời gian chờ transaction khác.
      const now = new Date();

      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      // Phòng trường hợp TTL quá lớn khiến Date không hợp lệ.
      if (Number.isNaN(expiresAt.getTime())) {
        throw new Error('Cấu hình TTL tạo ra thời điểm hết hạn không hợp lệ.');
      }

      // Vô hiệu hóa toàn bộ token cũ cùng purpose.
      // Không xóa các token cũ để còn lịch sử phục vụ audit.
      await client.accountActionToken.updateMany({
        where: {
          userId,
          purpose,
          usedAt: null,
          invalidatedAt: null,
        },
        data: {
          invalidatedAt: now,
        },
      });

      // Lưu token mới.
      // Chỉ lưu SHA-256 hash, không lưu rawToken.
      await client.accountActionToken.create({
        data: {
          userId,
          purpose,
          tokenHash,
          expiresAt,
        },
      });

      // Trả token gốc cho AuthService.
      // Nếu transaction rollback, kết quả này không được sử dụng để gửi email. AuthService phải chờ commit.
      return {
        rawToken,
        expiresAt,
      };
    };

    if (tx) {
      return createWithinTransaction(tx);
    }

    return this.prisma.$transaction(async (client) =>
      createWithinTransaction(client),
    );
  }

  // Kiểm tra token có hợp lệ tại thời điểm hiện tại hay không.
  // Có thể dùng khi Frontend cần kiểm tra link trước khi hiển thị form thiết lập mật khẩu.
  async verifyToken(
    rawToken: string,
    purpose: AccountActionPurpose,
  ): Promise<boolean> {
    // Từ chối token sai định dạng.
    if (!this.isValidTokenFormat(rawToken)) {
      return false;
    }

    // Hash token trước khi truy vấn.
    const tokenHash = this.hashToken(rawToken);

    // Chỉ lấy các trường cần thiết.
    const token = await this.prisma.accountActionToken.findUnique({
      where: {
        tokenHash,
      },
      select: {
        purpose: true,
        usedAt: true,
        invalidatedAt: true,
        expiresAt: true,
      },
    });

    // Không tồn tại trong database.
    if (!token) {
      return false;
    }

    // Token phải thuộc đúng nghiệp vụ.
    if (token.purpose !== purpose) {
      return false;
    }

    // Token đã được sử dụng.
    if (token.usedAt !== null) {
      return false;
    }

    // Token đã bị vô hiệu hóa.
    if (token.invalidatedAt !== null) {
      return false;
    }

    // Token đã hết hạn.
    if (token.expiresAt.getTime() <= Date.now()) {
      return false;
    }

    return true;
  }

  // Kiểm tra và đánh dấu một token đã được sử dụng.
  async consumeToken(
    rawToken: string,
    purpose: AccountActionPurpose,
    tx: Prisma.TransactionClient,
  ): Promise<ConsumeTokenResult | null> {
    // Kiểm tra định dạng token.
    if (!this.isValidTokenFormat(rawToken)) {
      return null;
    }

    const tokenHash = this.hashToken(rawToken);

    // Tìm User sở hữu token.
    const existingToken = await tx.accountActionToken.findUnique({
      where: {
        tokenHash,
      },
      select: {
        userId: true,
      },
    });

    if (!existingToken) {
      return null;
    }

    // Khóa dòng User.
    // Điều này giúp tránh hai nghiệp vụ cùng tài khoản thao tác token theo thứ tự khóa trái ngược.
    const userExists = await this.lockUser(tx, existingToken.userId);

    if (!userExists) {
      return null;
    }

    // Lấy thời điểm hiện tại sau khi đã có khóa User.
    const now = new Date();

    // UPDATE nguyên tử.
    const result = await tx.accountActionToken.updateMany({
      where: {
        tokenHash,
        purpose,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        usedAt: now,
      },
    });

    // Không có bản ghi nào đáp ứng điều kiện: token sai, đã dùng, bị vô hiệu hóa hoặc hết hạn.
    if (result.count !== 1) {
      return null;
    }

    // Trả về User ID đã được tìm thấy.
    // Không cần truy vấn lại token sau UPDATE.
    return {
      userId: existingToken.userId,
      purpose,
    };
  }

  // Khóa bản ghi User bằng PostgreSQL SELECT ... FOR UPDATE.
  private async lockUser(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "users"
      WHERE "id" = ${userId}::uuid
      FOR UPDATE
    `;

    return rows.length === 1;
  }

  // Đọc thời hạn token theo từng AccountActionPurpose.
  private getTtlSeconds(purpose: AccountActionPurpose): number {
    const config = TOKEN_TTL_CONFIG[purpose];

    if (!config) {
      throw new Error('AccountActionPurpose không được hỗ trợ.');
    }

    const rawValue = process.env[config.envName];

    // Chỉ dùng mặc định nếu biến thực sự chưa khai báo.
    const ttlSeconds =
      rawValue === undefined ? config.defaultSeconds : Number(rawValue);

    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(
        `Cấu hình ${config.envName} phải là số nguyên dương hợp lệ.`,
      );
    }

    return ttlSeconds;
  }

  // Chỉ chấp nhận token 64 ký tự hex viết thường, đúng định dạng do randomBytes(32) tạo ra.
  // Kiểm tra này không thay thế việc truy vấn database.
  private isValidTokenFormat(rawToken: unknown): rawToken is string {
    return typeof rawToken === 'string' && TOKEN_PATTERN.test(rawToken);
  }

  // Dùng SHA-256 để băm raw token thành 64 ký tự hex.
  // Không dùng hàm này để hash password người dùng.
  // Mật khẩu phải được hash bằng thuật toán chuyên dụng như Argon2 hoặc bcrypt trong AuthService.
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
