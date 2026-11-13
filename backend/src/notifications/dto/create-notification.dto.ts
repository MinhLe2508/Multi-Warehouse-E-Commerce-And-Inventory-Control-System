import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

// Tạm dùng enum string thay vì import từ Prisma để tránh phụ thuộc vào generated client
// Khi Prisma Client đã generate xong, có thể đổi sang import { NotificationType } from '@prisma/client'
export enum NotificationType {
  LOW_STOCK = 'LOW_STOCK',
  ORDER_UPDATE = 'ORDER_UPDATE',
  SYSTEM = 'SYSTEM',
}

export class CreateNotificationDto {
  @IsUUID()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  referenceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  referenceId?: string;
}
