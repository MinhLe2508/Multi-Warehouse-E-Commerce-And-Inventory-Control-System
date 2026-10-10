import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

import { PrismaModule } from './prisma/prisma.module';

import { MailModule } from './mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [AppController, HealthController],
  providers: [AppService, HealthService],
})
export class AppModule {}

