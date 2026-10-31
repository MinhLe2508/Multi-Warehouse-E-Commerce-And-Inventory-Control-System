/**
  NHIỆM VỤ:
  - Customer đăng ký, Admin tạo Staff, gửi email thiết lập mật khẩu.
  - Hoàn tất onboarding qua token một lần; đăng nhập / đăng xuất.
  - Refresh Token opaque (SHA-256 trong DB), rotate mỗi lần refresh.
  - Đổi mật khẩu, quên mật khẩu, đặt lại mật khẩu và gửi lại email.
 
  QUY ƯỚC:
  - Không sử dụng mật khẩu mặc định FiveTL524.
  - isActive là trạng thái khóa/mở khóa do Admin quản lý.
  - emailVerifiedAt phản ánh hoàn tất onboarding (ADMIN seed ngoại lệ).
  - Token email và cập nhật User phải cùng transaction khi tiêu thụ.
  - Mọi email được gửi SAU KHI transaction tạo token đã commit.
  - Các interface Input tạm thời; DTO sẽ chốt sau khi review Controller.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountActionPurpose, Prisma, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  AccountActionTokenService,
  type CreatedActionToken,
} from './account-action-token.service';
import { type JwtPayload } from './strategies/jwt.strategy';

const BCRYPT_SALT_ROUNDS = 12;
const OPAQUE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const MAX_USERNAME_ATTEMPTS = 8;

// Tạm giữ hợp đồng đầu vào của AuthService hiện tại; chưa phải DTO runtime.
export interface RegisterCustomerInput {
  email: string;
  fullName: string;
  phone?: string;
}
export interface CreateStaffInput {
  email: string;
  fullName: string;
  phone?: string;
}
export interface CompleteActivationInput {
  token: string;
  password: string;
}
export interface LoginInput {
  username: string;
  password: string;
}
export interface RefreshInput {
  refreshToken: string;
}
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
export interface ForgotPasswordInput {
  email: string;
}
export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}
export interface PublicUserProfile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// Một kiểu dữ liệu tái sử dụng cho giao dịch tạo tài khoản.
interface PendingAccountResult {
  user: PublicUserProfile;
  actionToken: CreatedActionToken;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Hash giả tạo một lần khi service khởi tạo để chống đoán username qua chênh lệch thời gian.
  // Không hash mới cho mỗi lần đăng nhập thất bại.
  private readonly dummyPasswordHash = bcrypt.hash(
    randomBytes(32).toString('hex'),
    BCRYPT_SALT_ROUNDS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly accountActionTokenService: AccountActionTokenService,
  ) {}

  // =========================================================================
  // 1. CUSTOMER ĐĂNG KÝ
  // =========================================================================
  async registerCustomer(
    input: RegisterCustomerInput,
  ): Promise<{ email: string }> {
    const email = this.normalizeEmail(input.email);
    const fullName = this.normalizeFullName(input.fullName);
    const phone = this.normalizePhone(input.phone);

    // User + token được ghi nguyên tử, tránh có User nhưng không có token.
    const { user, actionToken } = await this.createPendingAccount(
      { email, fullName, phone },
      UserRole.CUSTOMER,
      AccountActionPurpose.EMAIL_VERIFICATION,
    );

    // Không gửi email trong transaction: SMTP là thao tác bên ngoài database.
    try {
      await this.mailService.sendCustomerVerification({
        to: user.email,
        fullName: user.fullName,
        verifyUrl: this.buildFrontendActionUrl(
          'verify-email',
          actionToken.rawToken,
        ),
      });
    } catch {
      // User đã tồn tại; không xóa User/rollback giả sau khi commit.
      // Frontend cần hướng dẫn sử dụng chức năng gửi lại email.
      this.logger.error(
        'Tạo Customer thành công nhưng gửi email xác thực thất bại.',
      );
      throw new ServiceUnavailableException(
        'Tài khoản đã được tạo nhưng chưa gửi được Email. Vui lòng thử gửi lại Email xác thực.',
      );
    }

    return { email: user.email };
  }

  // =========================================================================
  // 2. ADMIN TẠO STAFF (chỉ gọi từ endpoint đã qua RolesGuard ADMIN)
  // =========================================================================
  async createStaff(input: CreateStaffInput): Promise<PublicUserProfile> {
    const email = this.normalizeEmail(input.email);
    const fullName = this.normalizeFullName(input.fullName);
    const phone = this.normalizePhone(input.phone);

    const { user, actionToken } = await this.createPendingAccount(
      { email, fullName, phone },
      UserRole.WAREHOUSE_STAFF,
      AccountActionPurpose.STAFF_INVITATION,
    );

    try {
      await this.mailService.sendStaffInvitation({
        to: user.email,
        fullName: user.fullName,
        username: user.username,
        setupUrl: this.buildFrontendActionUrl(
          'staff-invitation',
          actionToken.rawToken,
        ),
      });
    } catch {
      this.logger.error(
        'Tạo Staff thành công nhưng gửi Email Invitation thất bại.',
      );
      throw new ServiceUnavailableException(
        'Tài khoản Staff đã được tạo nhưng chưa gửi được thư mời. Admin cần gửi lại Invitation.',
      );
    }

    return user;
  }

  // =========================================================================
  // 3. HOÀN TẤT ONBOARDING — CUSTOMER / STAFF
  // =========================================================================
  async completeActivation(
    input: CompleteActivationInput,
    purpose:
      | typeof AccountActionPurpose.EMAIL_VERIFICATION
      | typeof AccountActionPurpose.STAFF_INVITATION,
  ): Promise<PublicUserProfile> {
    this.validateNewPassword(input.password);

    // Kiểm tra trước để không tốn bcrypt cho token sai.
    if (
      !(await this.accountActionTokenService.verifyToken(input.token, purpose))
    ) {
      throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn.');
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const consumed = await this.accountActionTokenService.consumeToken(
        input.token,
        purpose,
        tx,
      );
      if (!consumed) {
        throw new BadRequestException(
          'Liên kết không hợp lệ, đã dùng hoặc đã hết hạn.',
        );
      }

      const account = await tx.user.findUnique({
        where: { id: consumed.userId },
        select: { role: true, isActive: true, emailVerifiedAt: true },
      });
      const expectedRole =
        purpose === AccountActionPurpose.EMAIL_VERIFICATION
          ? UserRole.CUSTOMER
          : UserRole.WAREHOUSE_STAFF;

      // Token cũ không được kích hoạt tài khoản đã bị Admin khóa/đổi role.
      if (
        !account ||
        !account.isActive ||
        account.role !== expectedRole ||
        account.emailVerifiedAt !== null
      ) {
        throw new BadRequestException(
          'Tài khoản không đủ điều kiện kích hoạt.',
        );
      }

      // Không đổi isActive
      return tx.user.update({
        where: { id: consumed.userId },
        data: {
          passwordHash,
          emailVerifiedAt: new Date(),
          mustChangePassword: false,
        },
        select: this.publicUserSelect(),
      });
    });
  }

  // =========================================================================
  // 4. ĐĂNG NHẬP
  // =========================================================================
  async login(
    input: LoginInput,
  ): Promise<{ tokens: AuthTokenPair; user: PublicUserProfile }> {
    if (
      typeof input.username !== 'string' ||
      typeof input.password !== 'string'
    ) {
      throw new UnauthorizedException(
        'Tên đăng nhập hoặc mật khẩu không chính xác.',
      );
    }
    const username = input.username.trim();
    const invalidMessage = 'Tên đăng nhập hoặc mật khẩu không chính xác.';

    const existing = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true },
    });
    const hashToCompare =
      existing?.passwordHash ?? (await this.dummyPasswordHash);
    const valid = await bcrypt.compare(input.password, hashToCompare);
    if (!existing || !valid) {
      throw new UnauthorizedException(invalidMessage);
    }

    // Khóa User để không cấp Refresh Token xen giữa thao tác đổi mật khẩu và thu hồi tất cả Refresh Token của User.
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, existing.id);
      const user = await tx.user.findUnique({
        where: { id: existing.id },
        select: {
          ...this.publicUserSelect(),
          passwordHash: true,
          isActive: true,
          emailVerifiedAt: true,
        },
      });
      // Nếu mật khẩu vừa bị thay đổi, không cấp phiên từ lần kiểm tra cũ.
      if (
        !user ||
        user.passwordHash !== existing.passwordHash ||
        !this.canAuthenticate(user)
      ) {
        throw new UnauthorizedException(
          'Tài khoản không khả dụng hoặc thông tin đăng nhập đã thay đổi.',
        );
      }
      const tokens = await this.issueTokenPair(user.id, tx);
      return { tokens, user: this.toPublicUser(user) };
    });
  }

  // =========================================================================
  // 5. REFRESH — ROTATE TOKEN CŨ, CHỈ MỘT REQUEST ĐƯỢC THÀNH CÔNG
  // =========================================================================
  async refresh(
    input: RefreshInput,
  ): Promise<{ tokens: AuthTokenPair; user: PublicUserProfile }> {
    const rawToken = input?.refreshToken;
    if (!this.isOpaqueToken(rawToken)) {
      throw new UnauthorizedException('Refresh Token không hợp lệ.');
    }
    const tokenHash = this.hashOpaqueToken(rawToken);

    // Tra cứu nhanh để biết User cần khóa; KHÔNG dựa vào trạng thái ở đây
    // để xác định token còn hợp lệ vì request khác có thể đã rotate.
    const reference = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });
    if (!reference) {
      throw new UnauthorizedException('Refresh Token không hợp lệ.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, reference.userId);
      const token = await tx.refreshToken.findUnique({
        where: { id: reference.id },
        select: { id: true, userId: true, revokedAt: true, expiresAt: true },
      });
      const now = new Date();

      if (!token || token.revokedAt !== null || token.expiresAt <= now) {
        throw new UnauthorizedException(
          'Refresh Token không hợp lệ hoặc đã hết hạn.',
        );
      }

      const user = await tx.user.findUnique({
        where: { id: reference.userId },
        select: {
          ...this.publicUserSelect(),
          isActive: true,
          emailVerifiedAt: true,
        },
      });
      if (!user || !this.canAuthenticate(user)) {
        throw new UnauthorizedException('Tài khoản không còn khả dụng.');
      }

      // UPDATE có điều kiện: chỉ một request có thể đổi revokedAt từ null.
      const changed = await tx.refreshToken.updateMany({
        where: {
          id: token.id,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      if (changed.count !== 1) {
        throw new UnauthorizedException('Refresh Token đã được sử dụng.');
      }

      // Bắt buộc tạo Refresh Token mới bằng CÙNG transaction.
      const tokens = await this.issueTokenPair(user.id, tx);
      return { tokens, user: this.toPublicUser(user) };
    });
  }

  // =========================================================================
  // 6. ĐĂNG XUẤT — THU HỒI ĐÚNG REFRESH TOKEN ĐƯỢC GỬI
  // =========================================================================
  async logout(userId: string, refreshToken: string): Promise<void> {
    if (
      typeof refreshToken !== 'string' ||
      !/^[0-9a-f]{64}$/.test(refreshToken)
    ) {
      return;
    }

    // Chỉ băm token, không lưu hoặc ghi log token gốc.
    const tokenHash = this.hashOpaqueToken(refreshToken);

    // Thu hồi token khi đồng thời thỏa mãn:
    // 1. Thuộc đúng người dùng đang đăng nhập.
    // 2. Có tokenHash khớp với Refresh Token được gửi lên.
    // 3. Chưa bị thu hồi trước đó.
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  // =========================================================================
  // 7. ĐỔI MẬT KHẨU KHI ĐÃ ĐĂNG NHẬP
  // =========================================================================
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    this.validateNewPassword(input.newPassword);
    if (typeof input.currentPassword !== 'string') {
      throw new BadRequestException('Mật khẩu hiện tại không hợp lệ.');
    }
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (
      !existing ||
      !(await bcrypt.compare(input.currentPassword, existing.passwordHash))
    ) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác.');
    }
    if (await bcrypt.compare(input.newPassword, existing.passwordHash)) {
      throw new BadRequestException(
        'Mật khẩu mới phải khác mật khẩu hiện tại.',
      );
    }
    const passwordHash = await bcrypt.hash(
      input.newPassword,
      BCRYPT_SALT_ROUNDS,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: {
          passwordHash: true,
          isActive: true,
          emailVerifiedAt: true,
          role: true,
        },
      });
      if (!current || !this.canAuthenticate(current)) {
        throw new UnauthorizedException('Tài khoản không còn khả dụng.');
      }
      if (current.passwordHash !== existing.passwordHash) {
        throw new ConflictException(
          'Mật khẩu đã được thay đổi bởi một yêu cầu khác.',
        );
      }
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  // =========================================================================
  // 8. QUÊN MẬT KHẨU — TRẢ CÙNG KẾT QUẢ DÙ EMAIL TỒN TẠI HAY KHÔNG
  // =========================================================================
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        role: true,
        emailVerifiedAt: true,
      },
    });
    if (!user || !this.canAuthenticate(user)) return;

    try {
      const action = await this.accountActionTokenService.createToken(
        user.id,
        AccountActionPurpose.PASSWORD_RESET,
      );
      await this.mailService.sendPasswordReset({
        to: user.email,
        fullName: user.fullName,
        resetUrl: this.buildFrontendActionUrl(
          'reset-password',
          action.rawToken,
        ),
      });
    } catch {
      this.logger.error(
        'Không thể xử lý Email quên mật khẩu. Cần kiểm tra cấu hình SMTP/DataBase.',
      );
    }
  }

  // =========================================================================
  // 9. ĐẶT LẠI MẬT KHẨU QUA LINK
  // =========================================================================
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    this.validateNewPassword(input.newPassword);
    if (
      !(await this.accountActionTokenService.verifyToken(
        input.token,
        AccountActionPurpose.PASSWORD_RESET,
      ))
    ) {
      throw new BadRequestException(
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
      );
    }
    const passwordHash = await bcrypt.hash(
      input.newPassword,
      BCRYPT_SALT_ROUNDS,
    );

    await this.prisma.$transaction(async (tx) => {
      const consumed = await this.accountActionTokenService.consumeToken(
        input.token,
        AccountActionPurpose.PASSWORD_RESET,
        tx,
      );
      if (!consumed) {
        throw new BadRequestException(
          'Liên kết đã hết hạn hoặc được sử dụng trước đó.',
        );
      }
      const user = await tx.user.findUnique({
        where: { id: consumed.userId },
        select: { isActive: true, role: true, emailVerifiedAt: true },
      });
      if (!user || !this.canAuthenticate(user)) {
        throw new BadRequestException(
          'Tài khoản không đủ điều kiện đặt lại mật khẩu.',
        );
      }

      await tx.user.update({
        where: { id: consumed.userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId: consumed.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  // =========================================================================
  // 10. GỬI LẠI EMAIL XÁC THỰC CUSTOMER
  // =========================================================================
  async resendEmailVerification(email: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
      },
    });
    // Không gửi lại cho User đã xác thực hoặc bị Admin khóa.
    if (
      !user ||
      user.role !== UserRole.CUSTOMER ||
      !user.isActive ||
      user.emailVerifiedAt !== null
    )
      return;

    try {
      const action = await this.accountActionTokenService.createToken(
        user.id,
        AccountActionPurpose.EMAIL_VERIFICATION,
      );
      await this.mailService.sendCustomerVerification({
        to: user.email,
        fullName: user.fullName,
        verifyUrl: this.buildFrontendActionUrl('verify-email', action.rawToken),
      });
    } catch {
      // Không tiết lộ trạng thái User thông qua khác biệt mã lỗi response.
      this.logger.error('Không gửi được email xác thực Customer.');
    }
  }

  async resendStaffInvitation(email: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        fullName: true,
        username: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
      },
    });
    if (
      !user ||
      user.role !== UserRole.WAREHOUSE_STAFF ||
      !user.isActive ||
      user.emailVerifiedAt !== null
    ) {
      throw new BadRequestException(
        'Staff không tồn tại hoặc không cần kích hoạt.',
      );
    }
    const action = await this.accountActionTokenService.createToken(
      user.id,
      AccountActionPurpose.STAFF_INVITATION,
    );
    await this.mailService.sendStaffInvitation({
      to: user.email,
      fullName: user.fullName,
      username: user.username,
      setupUrl: this.buildFrontendActionUrl(
        'staff-invitation',
        action.rawToken,
      ),
    });
  }

  // =========================================================================
  // 11. CÁC HÀM DÙNG CHUNG (PRIVATE)
  // =========================================================================
  private async createPendingAccount(
    input: { email: string; fullName: string; phone: string | null },
    role: typeof UserRole.CUSTOMER | typeof UserRole.WAREHOUSE_STAFF,
    purpose: AccountActionPurpose,
  ): Promise<PendingAccountResult> {
    const duplicatedEmail = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (duplicatedEmail) {
      throw new ConflictException(
        'Email này đã được đăng ký tài khoản trước đó.',
      );
    }

    // Hash placeholder bên ngoài transaction để không giữ khóa lâu.
    const passwordHash = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      BCRYPT_SALT_ROUNDS,
    );

    for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt += 1) {
      const username = this.generateUsernameCandidate(input.email, attempt);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              username,
              email: input.email,
              fullName: input.fullName,
              phone: input.phone,
              passwordHash,
              role,
              isActive: true,
              emailVerifiedAt: null,
              mustChangePassword: false,
            },
            select: this.publicUserSelect(),
          });
          const actionToken = await this.accountActionTokenService.createToken(
            user.id,
            purpose,
            tx,
          );
          return { user, actionToken };
        });
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();
          if (target.includes('email')) {
            throw new ConflictException(
              'Email này đã được đăng ký tài khoản trước đó.',
            );
          }
          // Chỉ thử lại khi trùng username; không che giấu lỗi unique khác.
          if (target.includes('username')) continue;
          throw new ConflictException('Email hoặc tên đăng nhập đã tồn tại.');
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Không thể tạo tên đăng nhập duy nhất. Vui lòng thử lại.',
    );
  }

  private async issueTokenPair(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<AuthTokenPair> {
    const accessSeconds = this.parseExpiresInToSeconds(
      process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    );
    const refreshSeconds = this.parseExpiresInToSeconds(
      process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    );
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret?.trim()) {
      throw new Error('JWT_ACCESS_SECRET chưa được cấu hình.');
    }

    const payload: JwtPayload = { sub: userId, type: 'access' };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret,
      algorithm: 'HS256',
      expiresIn: accessSeconds,
    });
    const decoded = this.jwtService.decode<{ exp?: number } | null>(
      accessToken,
    );
    if (typeof decoded?.exp !== 'number') {
      throw new Error('Access Token vừa ký không có thời điểm hết hạn.');
    }

    const refreshToken = randomBytes(32).toString('hex');
    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashOpaqueToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshSeconds * 1000),
      },
    });
    return { accessToken, refreshToken, accessTokenExpiresAt: decoded.exp };
  }

  private async lockUser(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new UnauthorizedException('Tài khoản không còn tồn tại.');
    }
  }

  // Trạng thái cho phép đăng nhập/cấp token, nhất quán với JwtStrategy.
  private canAuthenticate(user: {
    isActive: boolean;
    role: UserRole;
    emailVerifiedAt: Date | null;
  }): boolean {
    return (
      user.isActive &&
      (user.role === UserRole.ADMIN || user.emailVerifiedAt !== null)
    );
  }

  // Những field công khai được phép trả cho client; không có passwordHash
  private publicUserSelect() {
    return {
      id: true as const,
      username: true as const,
      email: true as const,
      fullName: true as const,
      role: true as const,
      mustChangePassword: true as const,
    };
  }

  // Chỉ trích xuất thông tin công khai từ đối tượng User.
  private toPublicUser(user: PublicUserProfile): PublicUserProfile {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  // Sinh username từ local-part email, có fallback nếu toàn ký tự đặc biệt
  private generateUsernameCandidate(email: string, attempt: number): string {
    const localPart = email.split('@')[0] ?? '';
    const base =
      localPart
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .slice(0, 20) || 'user';
    return attempt === 0 ? base : `${base}${randomBytes(4).toString('hex')}`;
  }

  private normalizeEmail(email: string): string {
    if (typeof email !== 'string')
      throw new BadRequestException('Email không hợp lệ.');
    const value = email.trim().toLowerCase();
    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new BadRequestException('Email không hợp lệ.');
    }
    return value;
  }

  private normalizeFullName(fullName: string): string {
    if (
      typeof fullName !== 'string' ||
      !fullName.trim() ||
      fullName.trim().length > 150
    ) {
      throw new BadRequestException('Họ và tên không hợp lệ.');
    }
    return fullName.trim();
  }

  private normalizePhone(phone?: string): string | null {
    if (phone === undefined || phone === null || phone === '') return null;
    if (typeof phone !== 'string' || phone.trim().length > 20) {
      throw new BadRequestException('Số điện thoại không hợp lệ.');
    }
    return phone.trim() || null;
  }

  // Bcrypt chỉ sử dụng tối đa 72 byte đầu; giới hạn để tránh cắt cụt bí mật
  private validateNewPassword(password: unknown): asserts password is string {
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự.');
    }
  }

  private isOpaqueToken(rawToken: unknown): rawToken is string {
    return typeof rawToken === 'string' && OPAQUE_TOKEN_PATTERN.test(rawToken);
  }

  private hashOpaqueToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  // Dựng link email; không log URL này vì có token gốc.
  private buildFrontendActionUrl(
    slug: 'verify-email' | 'staff-invitation' | 'reset-password',
    rawToken: string,
  ): string {
    const origin = process.env.FRONTEND_ORIGIN?.trim();
    if (!origin) throw new Error('FRONTEND_ORIGIN chưa được cấu hình.');
    const url = new URL(`/${slug}`, origin);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('FRONTEND_ORIGIN phải dùng HTTP hoặc HTTPS.');
    }
    url.searchParams.set('token', rawToken);
    return url.toString();
  }

  private parseExpiresInToSeconds(value: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
    if (!match) throw new Error('Định dạng thời hạn token không hợp lệ.');
    const unitSeconds: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    const seconds = Number(match[1]) * unitSeconds[match[2]];
    if (
      !Number.isSafeInteger(seconds) ||
      seconds <= 0 ||
      seconds > 365 * 86400
    ) {
      throw new Error(
        'Thời hạn Token phải là số nguyên dương tối đa 365 ngày.',
      );
    }
    return seconds;
  }
}
