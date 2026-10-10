// Service duy nhất chịu trách nhiệm gửi email qua Gmail SMTP bằng Nodemailer.
//
// CÁC CHỨC NĂNG:
// 1. sendCustomerVerification(): Xác thực email và thiết lập mật khẩu Customer.
// 2. sendStaffInvitation(): Mời Staff kích hoạt tài khoản.
// 3. sendPasswordReset(): Khôi phục mật khẩu cho Customer/Staff.

import {Injectable, Logger, ServiceUnavailableException,} from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

// 1. INTERFACES

// Email xác thực tài khoản Customer.
export interface CustomerVerificationParams {
  to: string;
  fullName: string;
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

// Chuyển các ký tự HTML đặc biệt thành HTML entities.
function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return value.replace(
    /[&<>"']/g,
    (character) => entities[character],
  );
}


function readTtlSeconds(
  envName: string,
  defaultValue: number,
): number {
  const rawValue = process.env[envName];

  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Biến môi trường ${envName} phải là số nguyên dương.`,
    );
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
    this.senderAddress = ( process.env.GMAIL_USER ?? '').trim();

    // Google App Password gồm 16 ký tự
    // Loại bỏ khoảng trắng nếu copy theo nhóm 4 ký tự.
    const appPassword = (
      process.env.GMAIL_APP_PASSWORD ?? ''
    ).replace(/\s+/g, '');

    // Đọc FRONTEND_ORIGIN
    const frontendOriginValue = process.env.FRONTEND_ORIGIN?.trim() || 'http://localhost:3000';
    let parsedFrontendOrigin: URL;

    try {
      parsedFrontendOrigin = new URL(
        frontendOriginValue,
      );
    } catch {
      throw new Error(
        'FRONTEND_ORIGIN không phải URL hợp lệ.',
      );
    }

    if (
      !['http:', 'https:'].includes(
        parsedFrontendOrigin.protocol,
      ) ||
      parsedFrontendOrigin.username ||
      parsedFrontendOrigin.password
    ) {
      throw new Error(
        'FRONTEND_ORIGIN phải sử dụng HTTP hoặc HTTPS hợp lệ.',
      );
    }

    this.frontendOrigin = parsedFrontendOrigin.origin;

    // Đọc TTL từ environment
    this.customerVerificationTtlSeconds = readTtlSeconds('EMAIL_VERIFICATION_TTL_SECONDS', 60,);
    this.staffInvitationTtlSeconds      = readTtlSeconds('STAFF_INVITATION_TTL_SECONDS', 60,);
    this.passwordResetTtlSeconds        = readTtlSeconds('PASSWORD_RESET_TTL_SECONDS', 900,);

    // Khởi tạo Nodemailer transporter
    if (!this.senderAddress || !appPassword) {
      this.transporter = null;
      this.logger.warn( 'Chưa cấu hình Gmail SMTP đầy đủ. Chức năng gửi Email tạm thời không sử dụng được.',);
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

    this.logger.log( 'MailService đã được khởi tạo với Gmail SMTP.',);
  }


  // 4. VALIDATE FRONTEND URL
  private validateFrontendUrl(inputUrl: string,): string { 
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(inputUrl);
    } catch {
        throw new Error('Liên kết xác thực không phải URL hợp lệ.',);
    }

    if (
      !['http:', 'https:'].includes(
        parsedUrl.protocol,
      ) ||
      parsedUrl.origin !== this.frontendOrigin ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error('Liên kết Email không thuộc FRONTEND_ORIGIN cho phép.',);
    }

    return parsedUrl.toString();
  }


  // 5. SEND MAIL
  private async sendMail(
    params: SendMailParams,
  ): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException('Hệ thống gửi Email chưa được cấu hình.',);
    }

    try {
      await this.transporter.sendMail({
        from: {
          name: 'Multi-Warehouse E-Commerce',
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
      this.logger.log('Gmail SMTP đã tiếp nhận yêu cầu gửi Email.',);
    } catch (error: unknown) {
        const errorCode =
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'UNKNOWN';

      this.logger.error(`Gửi Email thất bại. SMTP Error Code: ${errorCode}`,);

      // Không để lộ chi tiết SMTP cho client
      throw new ServiceUnavailableException('Không thể gửi Email vào lúc này. Vui lòng thử lại sau.',);
    }
  }


  // 6. SEND CUSTOMER VERIFICATION
  async sendCustomerVerification(
    params: CustomerVerificationParams,
  ): Promise<void> {
    const verifyUrl = this.validateFrontendUrl(
      params.verifyUrl,
    );

    const safeName = escapeHtml(params.fullName);
    const safeUrl = escapeHtml(verifyUrl);

    const ttl = formatTtl(
      this.customerVerificationTtlSeconds,
    );

    await this.sendMail({
      to: params.to,

      subject:
        'Xác thực tài khoản - Multi Warehouse E-Commerce',

      text: [
        `Xin chào ${params.fullName},`,
        '',
        'Cảm ơn bạn đã đăng ký tài khoản tại hệ thống.',
        '',
        'Vui lòng mở liên kết sau để xác thực Gmail và thiết lập mật khẩu:',
        verifyUrl,
        '',
        `Liên kết có hiệu lực tối đa ${ttl} kể từ khi được tạo.`,
        'Liên kết chỉ được sử dụng một lần.',
        '',
        'Nếu liên kết hết hạn, vui lòng quay lại trang đăng ký',
        'và chọn Gửi lại Email xác thực.',
        '',
        'Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua Email.',
        '',
        'Multi Warehouse E-Commerce',
      ].join('\n'),

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Xác thực tài khoản</h2>

          <p>Xin chào <strong>${safeName}</strong>,</p>

          <p>
            Cảm ơn bạn đã đăng ký tài khoản tại
            Multi-Warehouse E-Commerce & Inventory Control System.
          </p>

          <p>
            Vui lòng nhấn vào liên kết sau để xác thực Gmail
            và thiết lập mật khẩu cho tài khoản của bạn
          </p>

          <p>
            <a href="${safeUrl}">
              Xác thực Gmail và thiết lập mật khẩu
            </a>
          </p>

          <p>
            <strong>Lưu ý:</strong>
            Liên kết có hiệu lực tối đa ${ttl}
            kể từ khi được tạo và chỉ được sử dụng một lần.
          </p>

          <p>
            Nếu liên kết đã hết hạn, vui lòng quay lại
            trang đăng ký và chọn
            "Gửi lại Email xác thực".
          </p>

          <p>
            Nếu bạn không thực hiện yêu cầu này,
            vui lòng bỏ qua Email.
          </p>

          <hr />

          <p>
            <small>Multi Warehouse E-Commerce</small>
          </p>
        </div>
      `,
    });
  }


  // 7. SEND STAFF INVITATION
  async sendStaffInvitation(
    params: StaffInvitationParams,
  ): Promise<void> {
    const setupUrl = this.validateFrontendUrl(
      params.setupUrl,
    );

    const safeName = escapeHtml(params.fullName);
    const safeUsername = escapeHtml(params.username);
    const safeUrl = escapeHtml(setupUrl);

    const ttl = formatTtl(
      this.staffInvitationTtlSeconds,
    );

    await this.sendMail({
      to: params.to,

      subject:
        'Thư mời kích hoạt tài khoản nhân viên',

      text: [
        `Xin chào ${params.fullName},`,
        '',
        'Quản trị viên đã tạo tài khoản nhân viên cho bạn.',
        '',
        `Tên đăng nhập: ${params.username}`,
        '',
        'Vui lòng mở liên kết sau để xác nhận Gmail',
        'và thiết lập mật khẩu lần đầu:',
        setupUrl,
        '',
        `Liên kết có hiệu lực tối đa ${ttl} kể từ khi được tạo.`,
        'Liên kết chỉ được sử dụng một lần.',
        '',
        'Nếu liên kết hết hạn, vui lòng liên hệ Quản trị viên',
        'để được gửi lại thư mời.',
        '',
        'Nếu bạn không mong đợi thư mời này,',
        'vui lòng liên hệ Quản trị viên.',
        '',
        'Multi Warehouse E-Commerce',
      ].join('\n'),

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Thư mời kích hoạt tài khoản nhân viên</h2>

          <p>Xin chào <strong>${safeName}</strong>,</p>

          <p>
            Quản trị viên đã tạo tài khoản nhân viên
            cho bạn trong hệ thống
            Multi-Warehouse E-Commerce & Inventory Control System.
          </p>

          <p>
            Tên đăng nhập của bạn: 
            <strong>${safeUsername}</strong>
          </p>

          <p>
            Vui lòng nhấn vào liên kết sau để xác nhận Gmail
            và thiết lập mật khẩu lần đầu:
          </p>

          <p>
            <a href="${safeUrl}">
              Kích hoạt tài khoản nhân viên
            </a>
          </p>

          <p>
            <strong>Lưu ý:</strong>
            Liên kết có hiệu lực tối đa ${ttl}
            kể từ khi được tạo và chỉ được sử dụng một lần.
          </p>

          <p>
            Nếu liên kết đã hết hạn,
            vui lòng liên hệ Quản trị viên
            để được gửi lại thư mời.
          </p>

          <p>
            Nếu bạn không mong đợi thư mời này,
            vui lòng liên hệ Quản trị viên.
          </p>

          <hr />

          <p>
            <small>Multi Warehouse E-Commerce</small>
          </p>
        </div>
      `,
    });
  }


  // 8. SEND PASSWORD RESET
  async sendPasswordReset(
    params: PasswordResetParams,
  ): Promise<void> {
    const resetUrl = this.validateFrontendUrl(
      params.resetUrl,
    );

    const safeName = escapeHtml(params.fullName);
    const safeUrl = escapeHtml(resetUrl);

    const ttl = formatTtl(
      this.passwordResetTtlSeconds,
    );

    await this.sendMail({
      to: params.to,

      subject:
        'Yêu cầu đặt lại mật khẩu - Multi Warehouse E-Commerce',

      text: [
        `Xin chào ${params.fullName},`,
        '',
        'Hệ thống đã nhận được yêu cầu đặt lại mật khẩu',
        'cho tài khoản của bạn.',
        '',
        'Vui lòng mở liên kết sau để đặt lại mật khẩu:',
        resetUrl,
        '',
        `Liên kết có hiệu lực tối đa ${ttl} kể từ khi được tạo.`,
        'Liên kết chỉ được sử dụng một lần.',
        '',
        'Nếu bạn không yêu cầu đổi mật khẩu,',
        'vui lòng bỏ qua Email này.',
        'Mật khẩu hiện tại không bị thay đổi bởi yêu cầu này.',
        '',
        'Multi Warehouse E-Commerce',
      ].join('\n'),

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Đặt lại mật khẩu</h2>

          <p>Xin chào <strong>${safeName}</strong>,</p>

          <p>
            Hệ thống đã nhận được yêu cầu
            đặt lại mật khẩu cho tài khoản của bạn.
          </p>

          <p>
            Vui lòng nhấn vào liên kết sau
            để thiết lập mật khẩu mới:
          </p>

          <p>
            <a href="${safeUrl}">
              Đặt lại mật khẩu
            </a>
          </p>

          <p>
            <strong>Lưu ý:</strong>
            Liên kết có hiệu lực tối đa ${ttl}
            kể từ khi được tạo và chỉ được sử dụng một lần.
          </p>

          <p>
            Nếu bạn không yêu cầu đặt lại mật khẩu,
            vui lòng bỏ qua Email này.
          </p>

          <p>
            Yêu cầu này không tự động thay đổi
            mật khẩu hiện tại của bạn.
          </p>

          <hr />

          <p>
            <small>Multi Warehouse E-Commerce</small>
          </p>
        </div>
      `,
    });
  }
}