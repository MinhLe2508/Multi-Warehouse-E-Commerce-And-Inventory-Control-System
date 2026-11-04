import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendChatMessageDto {
  @IsNotEmpty({ message: 'Nội dung tin nhắn không được để trống' })
  @IsString({ message: 'Nội dung tin nhắn phải là chuỗi' })
  @MaxLength(1000, { message: 'Nội dung tin nhắn không được quá 1000 ký tự' })
  message: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;
}

export class EscalateSessionDto {
  @IsNotEmpty({ message: 'sessionToken không được để trống' })
  @IsString()
  sessionToken: string;
}

export class IngestKbDocumentDto {
  @IsNotEmpty({ message: 'Tiêu đề tài liệu không được để trống' })
  @IsString()
  title: string;

  @IsNotEmpty({ message: 'Phân loại tài liệu (docType) không được để trống' })
  @IsString()
  docType: string;

  @IsNotEmpty({ message: 'Nội dung tài liệu không được để trống' })
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;
}

