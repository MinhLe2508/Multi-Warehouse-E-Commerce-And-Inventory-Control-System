// =============================================================================
// Multi-Warehouse E-Commerce & Inventory Control System
// File: backend/src/auth/auth.module.ts
// Owner: P4 (Backend Data Lead) — thuộc thư mục auth/, sở hữu riêng của P4
//
// MỤC ĐÍCH: Khai báo AuthModule của NestJS — "đóng gói" toàn bộ Controller,
// Service và Strategy của hệ thống xác thực thành 1 module hoàn chỉnh, và
// quan trọng nhất: EXPORT "AuthService" ra ngoài để các module khác (đặc
// biệt là AdminApi của Triết - P2) có thể INJECT và gọi trực tiếp các
// method nghiệp vụ như "createStaff()" — đúng như đã giải thích trong
// auth.controller.ts: việc Admin tạo tài khoản Staff là 1 hành động thuộc
// nghiệp vụ "Quản lý người dùng" của AdminApi, không phải 1 endpoint riêng
// trong AuthController.
//
// VÌ SAO DÙNG "JwtModule.registerAsync" (ĐỘNG) THAY VÌ "JwtModule.register"
// (TĨNH) VỚI SECRET CỐ ĐỊNH TRUYỀN SẴN LÚC KHAI BÁO MODULE:
//   Dự án có ĐẾN 2 secret khác nhau cho 2 loại Token (JWT_ACCESS_SECRET và
//   JWT_REFRESH_SECRET — theo đúng quyết định đã chốt "tách riêng Access và
//   Refresh Secret"), nhưng JwtModule của @nestjs/jwt chỉ hỗ trợ cấu hình 1
//   secret "mặc định" cho toàn module. Ở đây:
//     - Access Token: KHÔNG dùng secret mặc định của JwtModule, mà
//       AuthService.issueTokenPair() TỰ TRUYỀN "secret: JWT_ACCESS_SECRET"
//       trực tiếp vào từng lệnh "jwtService.signAsync(...)" (đã viết trong
//       auth.service.ts) — ghi đè secret mặc định của module cho CHÍNH lần
//       ký đó. JwtStrategy cũng tự đọc JWT_ACCESS_SECRET riêng, độc lập với
//       JwtModule (xem jwt.strategy.ts: "secretOrKey: process.env.JWT_ACCESS_SECRET").
//     - Refresh Token: KHÔNG dùng @nestjs/jwt/JWT để sinh (xem giải thích
//       trong auth.service.ts: Refresh Token là chuỗi ngẫu nhiên "opaque",
//       không phải JWT) — nên secret JWT_REFRESH_SECRET hiện TẠM THỜI CHƯA
//       được dùng tới ở Giai đoạn 4 này (được giữ lại trong .env cho khả
//       năng mở rộng sau này, ví dụ nếu nhóm quyết định đổi Refresh Token
//       sang dạng JWT có thể tự giải mã được).
//   Do đó, JwtModule.registerAsync ở đây chỉ cần cấu hình placeholder tối
//   thiểu (secret mặc định KHÔNG thực sự được dùng vì mọi lệnh ký đều tự
//   truyền secret riêng) — nhưng việc import "JwtModule" vẫn BẮT BUỘC, vì
//   đây là module cung cấp (provide) "JwtService" mà AuthService cần inject
//   qua constructor để gọi "jwtService.signAsync(...)".
// =============================================================================

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountActionTokenService } from './account-action-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    // PassportModule: cần thiết để NestJS nhận diện và đăng ký đúng
    // "JwtStrategy" (kế thừa PassportStrategy) vào hệ thống chiến lược của
    // Passport — không có dòng import này, "AuthGuard('jwt')" trong
    // JwtAuthGuard (core/guards/jwt-auth.guard.ts) sẽ không tìm thấy chiến
    // lược 'jwt' đã đăng ký, gây lỗi runtime khi có request đi qua Guard.
    PassportModule,

    // JwtModule.registerAsync: cung cấp JwtService cho AuthService inject.
    // Secret ở đây chỉ là giá trị MẶC ĐỊNH của module — AuthService LUÔN
    // ghi đè bằng JWT_ACCESS_SECRET + expiresIn riêng ở TỪNG lệnh ký thật
    // sự (xem AuthService.issueTokenPair(): mọi lệnh "signAsync(...)" đều
    // tự truyền "secret" và "expiresIn" tính sẵn bằng giây), nên CỐ Ý
    // KHÔNG khai báo "signOptions" ở cấp module tại đây — tránh nhầm lẫn
    // giữa 1 cấu hình "mặc định" không thực sự được dùng tới với cấu hình
    // THẬT SỰ áp dụng cho Access Token (nằm trong auth.service.ts). Giá
    // trị "secret" vẫn giữ lại cho đủ cấu trúc JwtModuleOptions hợp lệ và
    // phòng trường hợp sau này có chỗ nào gọi JwtService mà quên truyền
    // secret riêng — khi đó vẫn có 1 giá trị dự phòng hợp lý thay vì lỗi.
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET;

        if (!secret || !secret.trim()) {
          throw new Error(
            'Thiếu JWT_ACCESS_SECRET. Vui lòng kiểm tra file .env ở thư mục gốc dự án.',
          );
        }

        return { secret };
      },
    }),

    // MailModule: AuthService cần inject MailService để gửi email xác
    // thực/mời Staff/đặt lại mật khẩu. MailModule đã export MailService
    // (xem mail.module.ts đã code trước đó: "exports: [MailService]") nên
    // chỉ cần import ở đây là đủ, không cần khai báo lại provider.
    //
    // LƯU Ý: KHÔNG cần import "PrismaModule" ở đây dù AuthService và
    // AccountActionTokenService đều inject PrismaService — vì PrismaModule
    // đã được đánh dấu "@Global()" (xem prisma.module.ts: "Sau khi
    // PrismaModule được import một lần trong AppModule, PrismaService có
    // thể được inject vào các module khác... mà không cần khai báo
    // imports: [PrismaModule]"), miễn là PrismaModule đã được import đúng
    // 1 lần ở AppModule (file gốc của ứng dụng).
    MailModule,
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    // AccountActionTokenService: KHÔNG thuộc "Core/" dùng chung toàn hệ
    // thống — đây là service NỘI BỘ của riêng AuthModule (cơ chế Token xác
    // thực email/mời Staff/reset mật khẩu chỉ phục vụ luồng Auth), nên khai
    // báo provider tại đây, không export ra ngoài (không có module nào
    // khác trong dự án cần dùng trực tiếp AccountActionTokenService).
    AccountActionTokenService,
    // JwtStrategy: phải khai báo làm provider để NestJS khởi tạo đúng 1
    // instance duy nhất và tự động đăng ký với Passport (thông qua
    // PassportStrategy kế thừa trong jwt.strategy.ts) ngay khi AuthModule
    // được nạp — đây là bước "kết nối" cuối cùng khiến JwtAuthGuard
    // (core/guards/jwt-auth.guard.ts) hoạt động được trên toàn hệ thống.
    JwtStrategy,
  ],

  // EXPORT AuthService: để AdminApi (module của Triết - P2, sẽ import
  // AuthModule vào AdminApiModule) có thể inject AuthService qua
  // constructor và gọi "authService.createStaff(...)" trực tiếp khi Admin
  // tạo tài khoản nhân viên mới — đúng theo thiết kế đã thống nhất trong
  // auth.controller.ts (endpoint tạo Staff KHÔNG nằm trong AuthController).
  //
  // KHÔNG export AccountActionTokenService hay JwtStrategy: cả 2 đều là
  // chi tiết triển khai NỘI BỘ của AuthModule, không module nào khác trong
  // dự án cần truy cập trực tiếp — giữ nguyên tắc "chỉ export những gì thật
  // sự cần dùng từ bên ngoài", tránh rò rỉ chi tiết cài đặt không cần thiết.
  exports: [AuthService],
})
export class AuthModule {}