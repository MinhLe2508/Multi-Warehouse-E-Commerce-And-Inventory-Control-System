/**
 * =============================================================================
 * Multi-Warehouse E-Commerce & Inventory Control System
 * File: backend/src/auth/auth.controller.ts
 * Owner: P4 (Backend Data Lead)
 *
 * MỤC ĐÍCH:
 * - Nhận yêu cầu HTTP liên quan đến xác thực tài khoản.
 * - Chuyển dữ liệu đầu vào cho AuthService thực hiện nghiệp vụ.
 * - Quy định rõ endpoint công khai và endpoint yêu cầu Access Token.
 * - Trả mã HTTP và nội dung phản hồi nhất quán cho Frontend.
 *
 * PHÂN CHIA TRÁCH NHIỆM:
 * - Controller không trực tiếp truy vấn database, băm mật khẩu hay gửi email.
 * - Customer đăng ký và Staff hoàn tất lời mời qua các endpoint bên dưới.
 * - Admin tạo Staff thông qua AdminApi của P2, không qua Controller này.
 *
 * LƯU Ý VỀ KIỂM TRA ĐẦU VÀO:
 * - Hiện sử dụng interface tạm của AuthService vì DTO chưa được viết.
 * - Interface TypeScript KHÔNG tạo quy tắc kiểm tra dữ liệu khi chạy.
 * - Sau khi chốt DTO, thay các kiểu đầu vào bằng class DTO có decorator
 *   class-validator; đồng thời kiểm tra ValidationPipe đã được bật thật.
 *
 * BẢO VỆ ENDPOINT:
 * - @Public() dành cho những endpoint không cần Access Token.
 * - Các endpoint riêng tư gắn JwtAuthGuard trực tiếp, không phụ thuộc
 *   việc JwtAuthGuard đã được đăng ký toàn cục hay chưa.
 * - Nếu về sau đã đăng ký JwtAuthGuard toàn cục, cân nhắc bỏ các khai báo
 *   @UseGuards(JwtAuthGuard) trùng để tránh xác thực hai lần.
 * =============================================================================
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccountActionPurpose } from '@prisma/client';

import { Public } from '../core/decorators/public.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import {
  AuthService,
  type RegisterCustomerInput,
  type CompleteActivationInput,
  type LoginInput,
  type RefreshInput,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type PublicUserProfile,
  type AuthTokenPair,
} from './auth.service';

/**
 * Kiểu dữ liệu tạm cho yêu cầu gửi lại email xác thực.
 * Sẽ thay bằng DTO có kiểm tra định dạng email khi hoàn thiện thư mục dto/.
 */
interface ResendVerificationInput {
  email: string;
}

/** Phản hồi chỉ chứa thông báo để Frontend hiển thị. */
interface MessageResponse {
  message: string;
}

/** Phản hồi sau khi xác thực email hoặc chấp nhận lời mời thành công. */
interface ActivationResponse extends MessageResponse {
  user: PublicUserProfile;
}

/** Phản hồi đăng nhập hoặc làm mới token. */
interface AuthenticationResponse {
  tokens: AuthTokenPair;
  user: PublicUserProfile;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==========================================================================
  // 1. ĐĂNG KÝ VÀ HOÀN TẤT THIẾT LẬP TÀI KHOẢN
  // ==========================================================================

  /**
   * Customer gửi thông tin đăng ký.
   *
   * HTTP 202: Hệ thống đã tạo yêu cầu đăng ký, nhưng người dùng còn phải
   * xác thực email và tự thiết lập mật khẩu trước khi được đăng nhập.
   *
   * Không cấp Access Token tại bước này.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(
    @Body() input: RegisterCustomerInput,
  ): Promise<{ email: string; message: string }> {
    const result = await this.authService.registerCustomer(input);

    return {
      email: result.email,
      message:
        'Đăng ký thành công. Vui lòng kiểm tra email để xác thực và thiết lập mật khẩu.',
    };
  }

  /**
   * Customer mở link xác thực rồi gửi token và mật khẩu tự chọn.
   *
   * Purpose được ấn định tại Backend; không để Client tự chọn purpose.
   * AuthService sẽ tiêu thụ token và cập nhật User trong cùng transaction.
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() input: CompleteActivationInput,
  ): Promise<ActivationResponse> {
    const user = await this.authService.completeActivation(
      input,
      AccountActionPurpose.EMAIL_VERIFICATION,
    );

    return {
      user,
      message: 'Xác thực email thành công. Bạn có thể đăng nhập ngay bây giờ.',
    };
  }

  /**
   * Gửi lại link xác thực cho Customer chưa hoàn tất thiết lập tài khoản.
   *
   * Luôn trả cùng thông điệp dù email không tồn tại, đã xác thực hoặc
   * không đủ điều kiện nhận thư. Việc gửi thật do AuthService quyết định.
   *
   * Cần giới hạn tần suất gọi và thời gian chờ gửi lại tại tầng HTTP.
   */
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body() input: ResendVerificationInput,
  ): Promise<MessageResponse> {
    await this.authService.resendEmailVerification(input.email);

    return {
      message:
        'Nếu email tồn tại và chưa được xác thực, hệ thống sẽ gửi email xác thực mới.',
    };
  }

  /**
   * Staff mở link lời mời rồi gửi token và mật khẩu tự chọn.
   *
   * Chỉ chấp nhận token thuộc mục đích STAFF_INVITATION.
   * Việc tạo tài khoản Staff và gửi lại lời mời thuộc AdminApi.
   */
  @Public()
  @Post('activate-staff')
  @HttpCode(HttpStatus.OK)
  async activateStaff(
    @Body() input: CompleteActivationInput,
  ): Promise<ActivationResponse> {
    const user = await this.authService.completeActivation(
      input,
      AccountActionPurpose.STAFF_INVITATION,
    );

    return {
      user,
      message:
        'Kích hoạt tài khoản nhân viên thành công. Bạn có thể đăng nhập ngay bây giờ.',
    };
  }

  // ==========================================================================
  // 2. ĐĂNG NHẬP VÀ LÀM MỚI TOKEN
  // ==========================================================================

  /**
   * Đăng nhập bằng username và mật khẩu, dùng chung cho ba vai trò.
   *
   * AuthService kiểm tra tài khoản, xác thực mật khẩu và trả về cặp
   * Access Token (JWT) cùng Refresh Token (chuỗi ngẫu nhiên).
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginInput,
  ): Promise<AuthenticationResponse> {
    return this.authService.login(input);
  }

  /**
   * Cấp cặp token mới từ Refresh Token hợp lệ.
   *
   * Không yêu cầu Access Token vì Access Token cũ có thể đã hết hạn.
   * @Public() chỉ bỏ qua xác thực Access JWT; AuthService vẫn xác minh
   * Refresh Token trong PostgreSQL và thực hiện xoay vòng an toàn.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() input: RefreshInput,
  ): Promise<AuthenticationResponse> {
    return this.authService.refresh(input);
  }

  // ==========================================================================
  // 3. NGHIỆP VỤ YÊU CẦU ACCESS TOKEN HỢP LỆ
  // ==========================================================================

  /**
   * Đăng xuất một phiên, chỉ thu hồi Refresh Token thuộc người đang gọi.
   *
   * userId lấy từ Access Token đã được JwtStrategy xác thực; không nhận
   * userId do Client tự gửi trong body.
   *
   * YÊU CẦU ĐỒNG BỘ AUTH SERVICE:
   * AuthService.logout(userId, refreshToken) phải có điều kiện userId
   * cùng tokenHash khi cập nhật bảng RefreshToken.
   *
   * HTTP 204: Thành công nhưng không trả nội dung response.
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser('userId') userId: string,
    @Body() input: RefreshInput,
  ): Promise<void> {
    await this.authService.logout(userId, input.refreshToken);
  }

  /**
   * Đổi mật khẩu của tài khoản hiện tại.
   *
   * userId chỉ lấy từ request.user đã xác thực, không đọc từ body.
   * AuthService kiểm tra mật khẩu cũ và thu hồi các Refresh Token cũ.
   */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() input: ChangePasswordInput,
  ): Promise<void> {
    await this.authService.changePassword(userId, input);
  }

  /**
   * Lấy thông tin tài khoản đang đăng nhập.
   *
   * JwtStrategy đã truy vấn User và gắn dữ liệu vào request.user;
   * không cần truy vấn PostgreSQL lại chỉ để lấy các trường này.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): AuthenticatedUser {
    return user;
  }

  // ==========================================================================
  // 4. QUÊN MẬT KHẨU VÀ ĐẶT LẠI MẬT KHẨU
  // ==========================================================================

  /**
   * Gửi yêu cầu cấp link đặt lại mật khẩu có thời hạn mặc định 900 giây.
   *
   * Phản hồi không tiết lộ email có tồn tại trong hệ thống hay không.
   * Cần bổ sung giới hạn tần suất yêu cầu tại tầng HTTP.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() input: ForgotPasswordInput,
  ): Promise<MessageResponse> {
    await this.authService.forgotPassword(input);

    return {
      message:
        'Nếu email tồn tại trong hệ thống, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu.',
    };
  }

  /**
   * Dùng token PASSWORD_RESET để thiết lập mật khẩu mới do người dùng chọn.
   *
   * AuthService tiêu thụ token, cập nhật mật khẩu và thu hồi các
   * Refresh Token cũ trong cùng transaction; không dùng mật khẩu mặc định.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() input: ResetPasswordInput,
  ): Promise<MessageResponse> {
    await this.authService.resetPassword(input);

    return {
      message:
        'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    };
  }
}
