import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { KnowledgeBaseService } from '../../chatbot/rag/knowledge-base.service';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../../core/guards/password-changed.guard';
import { RolesGuard } from '../../core/guards/roles.guard';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class SaveKnowledgeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  docType!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content!: string;

  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  sourceUrl?: string;
}

class SetKnowledgeActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@Controller('admin/ai/knowledge')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminKnowledgeController {
  constructor(private readonly knowledge: KnowledgeBaseService) {}

  @Get('stats')
  async statistics() {
    return {
      ...(await this.knowledge.getStats()),
      embeddingConfigured: Boolean(process.env.VOYAGE_API_KEY?.trim()),
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  save(@Body() input: SaveKnowledgeDto) {
    return this.knowledge.saveTextDocument(input);
  }

  @Patch(':id')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { isActive }: SetKnowledgeActiveDto,
  ) {
    return this.knowledge.setChunkActive(id, isActive);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync() {
    if (!process.env.VOYAGE_API_KEY?.trim()) {
      throw new ServiceUnavailableException(
        'Cần cấu hình Voyage AI để đồng bộ vector.',
      );
    }
    try {
      return await this.knowledge.syncMissingEmbeddings(20);
    } catch {
      throw new ServiceUnavailableException(
        'Đồng bộ vector thất bại. Thử lại sau.',
      );
    }
  }
}
