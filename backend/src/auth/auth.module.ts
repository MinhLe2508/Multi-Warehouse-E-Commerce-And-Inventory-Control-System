// Mục đích: 
// - Khai báo AuthModule của NestJS — "đóng gói" toàn bộ Controller, Service và Strategy của hệ thống xác thực thành 1 module hoàn chỉnh
// - EXPORT "AuthService" ra ngoài để các module khác có thể INJECT và gọi trực tiếp các method nghiệp vụ như "createStaff()"

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
    PassportModule,

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

    MailModule,
  ],

  controllers: [AuthController],
  providers: [ AuthService, AccountActionTokenService, JwtStrategy, ],
  exports: [AuthService],
})
export class AuthModule {}