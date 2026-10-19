// =============================================================================
// DTO dùng chung cho 2 Endpoint cùng nhận "refreshToken" trong body
// Khớp chính xác với interface "RefreshInput" trong auth.service.ts
// DTO chỉ kiểm tra Refresh Token phải là chuỗi không rỗng.
// Không kiểm tra định dạng 64 ký tự hex tại đây.
//
// Với chuỗi không rỗng nhưng sai định dạng, AuthService tiếp tục xử lý:
// - refresh(): Ném UnauthorizedException (HTTP 401).
// - logout(): Bỏ qua Token sai định dạng, không thực hiện thu hồi.
//
// Lưu ý: request thiếu refreshToken, gửi chuỗi rỗng hoặc gửi sai kiểu dữ liệu sẽ bị ValidationPipe từ chối trước khi đi vào AuthService.
// =============================================================================

import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {

  // Refresh Token (chuỗi "opaque" ngẫu nhiên, không phải JWT) mà Client đang lưu giữ từ lần đăng nhập/làm mới token gần nhất
  @IsString({ message: 'Refresh Token phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Refresh Token không được để trống.' })
  refreshToken!: string;
}
