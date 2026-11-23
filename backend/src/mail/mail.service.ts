// Service duy nhất chịu trách nhiệm gửi email qua Gmail SMTP bằng Nodemailer.
//
// CÁC CHỨC NĂNG:
// 1. sendCustomerVerification(): Xác thực email và thiết lập mật khẩu Customer.
// 2. sendStaffInvitation(): Mời Staff kích hoạt tài khoản.
// 3. sendPasswordReset(): Khôi phục mật khẩu cho Customer/Staff.

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { renderAccountEmail } from './account-email.template';

// 1. INTERFACES

// Email xác thực tài khoản Customer.
export interface CustomerVerificationParams {
  to: string;
  fullName: string;
  username: string;
  verifyUrl: string;
}

// Email mời Staff do Admin tạo.
export interface StaffInvitationParams {
  to: string;
  fullName: string;
  username: string;
  setupUrl: string;
}

// Email đặt lại mật khẩu.
export interface PasswordResetParams {
  to: string;
  fullName: string;
  resetUrl: string;
}

// Dữ liệu đầu vào cho hàm gửi email nội bộ.
interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// 2. HELPER FUNCTIONS

function readTtlSeconds(envName: string, defaultValue: number): number {
  const rawValue = process.env[envName];

  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Biến môi trường ${envName} phải là số nguyên dương.`);
  }

  return value;
}

function formatTtl(seconds: number): string {
  if (seconds >= 120 && seconds % 60 === 0) {
    return `${seconds / 60} phút`;
  }

  return `${seconds} giây`;
}

// 3. MAIL SERVICE
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  // Nodemailer transporter
  private readonly transporter: Transporter | null;

  // Địa chỉ Gmail gửi email.
  private readonly senderAddress: string;
  private readonly frontendOrigin: string;

  // Thời hạn hiển thị trong email.
  private readonly customerVerificationTtlSeconds: number;
  private readonly staffInvitationTtlSeconds: number;
  private readonly passwordResetTtlSeconds: number;

  constructor() {
    // Đọc Gmail credentials
    this.senderAddress = (process.env.GMAIL_USER ?? '').trim();

    // Google App Password gồm 16 ký tự
    // Loại bỏ khoảng trắng nếu copy theo nhóm 4 ký tự.
    const appPassword = (process.env.GMAIL_APP_PASSWORD ?? '').replace(
      /\s+/g,
      '',
    );

    // Đọc FRONTEND_ORIGIN
    const frontendOriginValue =
      process.env.FRONTEND_ORIGIN?.trim() || 'http://localhost:3000';
    let parsedFrontendOrigin: URL;

    try {
      parsedFrontendOrigin = new URL(frontendOriginValue);
    } catch {
      throw new Error('FRONTEND_ORIGIN không phải URL hợp lệ.');
    }

    if (
      !['http:', 'https:'].includes(parsedFrontendOrigin.protocol) ||
      parsedFrontendOrigin.username ||
      parsedFrontendOrigin.password
    ) {
      throw new Error('FRONTEND_ORIGIN phải sử dụng HTTP hoặc HTTPS hợp lệ.');
    }

    this.frontendOrigin = parsedFrontendOrigin.origin;

    // Đọc TTL từ environment
    this.customerVerificationTtlSeconds = readTtlSeconds(
      'EMAIL_VERIFICATION_TTL_SECONDS',
      60,
    );
    this.staffInvitationTtlSeconds = readTtlSeconds(
      'STAFF_INVITATION_TTL_SECONDS',
      60,
    );
    this.passwordResetTtlSeconds = readTtlSeconds(
      'PASSWORD_RESET_TTL_SECONDS',
      900,
    );

    // Khởi tạo Nodemailer transporter
    if (!this.senderAddress || !appPassword) {
      this.transporter = null;
      this.logger.warn(
        'Chưa cấu hình Gmail SMTP đầy đủ. Chức năng gửi Email tạm thời không sử dụng được.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',

      auth: {
        user: this.senderAddress,
        pass: appPassword,
      },

      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    this.logger.log('MailService đã được khởi tạo với Gmail SMTP.');
  }

  // 4. VALIDATE FRONTEND URL
  private validateFrontendUrl(inputUrl: string): string {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(inputUrl);
    } catch {
      throw new Error('Liên kết xác thực không phải URL hợp lệ.');
    }

    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.origin !== this.frontendOrigin ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error('Liên kết Email không thuộc FRONTEND_ORIGIN cho phép.');
    }

    return parsedUrl.toString();
  }

  // 5. SEND MAIL
  private async sendMail(params: SendMailParams): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException(
        'Hệ thống gửi Email chưa được cấu hình.',
      );
    }

    try {
      await this.transporter.sendMail({
        from: {
          name: 'MultiMart',
          address: this.senderAddress,
        },

        to: params.to,
        subject: params.subject,

        // Hỗ trợ Email Client chỉ đọc plain text.
        text: params.text,

        // Nội dung HTML.
        html: params.html,
      });

      // Không log địa chỉ Email hay URL chứa token.
      this.logger.log('Gmail SMTP đã tiếp nhận yêu cầu gửi Email.');
    } catch (error: unknown) {
      const errorCode =
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'UNKNOWN';

      this.logger.error(`Gửi Email thất bại. SMTP Error Code: ${errorCode}`);

      // Không để lộ chi tiết SMTP cho client
      throw new ServiceUnavailableException(
        'Không thể gửi Email vào lúc này. Vui lòng thử lại sau.',
      );
    }
  }

  async sendCustomerVerification(
    params: CustomerVerificationParams,
  ): Promise<void> {
    const title = 'Xác thực tài khoản MultiMart';
    await this.sendMail({
      to: params.to,
      subject: title,
      ...renderAccountEmail({
        title,
        fullName: params.fullName,
        intro:
          'Mở liên kết để xác thực Gmail và thiết lập mật khẩu cho tài khoản mới.',
        actionLabel: 'Xác thực Email',
        username: params.username,
        url: this.validateFrontendUrl(params.verifyUrl),
        ttl: formatTtl(this.customerVerificationTtlSeconds),
        recovery:
          'Nếu liên kết hết hạn, chọn Gửi lại Email xác thực trên trang đăng ký.',
        footer:
          'Nếu bạn không đăng ký tài khoản MultiMart, bạn có thể bỏ qua thư này.',
      }),
    });
  }

  async sendStaffInvitation(params: StaffInvitationParams): Promise<void> {
    const title = 'Kích hoạt tài khoản nhân viên MultiMart';
    await this.sendMail({
      to: params.to,
      subject: title,
      ...renderAccountEmail({
        title,
        fullName: params.fullName,
        username: params.username,
        intro:
          'Quản trị viên đã tạo tài khoản nhân viên cho bạn. Đặt mật khẩu để truy cập khu vực làm việc.',
        actionLabel: 'Kích hoạt tài khoản',
        url: this.validateFrontendUrl(params.setupUrl),
        ttl: formatTtl(this.staffInvitationTtlSeconds),
        recovery:
          'Nếu liên kết hết hạn, liên hệ quản trị viên để được gửi lại lời mời.',
        footer:
          'Nếu bạn không mong đợi lời mời này, vui lòng liên hệ quản trị viên MultiMart.',
      }),
    });
  }

  async sendPasswordReset(params: PasswordResetParams): Promise<void> {
    const title = 'Đặt lại mật khẩu MultiMart';
    await this.sendMail({
      to: params.to,
      subject: title,
      ...renderAccountEmail({
        title,
        fullName: params.fullName,
        intro:
          'MultiMart đã nhận được yêu cầu đặt lại mật khẩu. Mở liên kết để chọn mật khẩu mới.',
        actionLabel: 'Đặt lại mật khẩu',
        url: this.validateFrontendUrl(params.resetUrl),
        ttl: formatTtl(this.passwordResetTtlSeconds),
        recovery:
          'Nếu liên kết hết hạn, yêu cầu liên kết mới trên trang Quên mật khẩu.',
        footer:
          'Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua thư này.',
      }),
    });
  }
}
