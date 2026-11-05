// =============================================================================
// Kiểm tra dữ liệu đầu vào cho API:
//   PATCH /admin/staff/:id/status
// =============================================================================

 import { Transform } from 'class-transformer';
 import { IsBoolean, IsDefined, IsString, Matches, MaxLength, ValidateIf, } from 'class-validator';

 // Giới hạn độ dài lý do. Có thể dùng chung với quy ước giao diện Admin.
 export const STAFF_STATUS_REASON_MAX_LENGTH = 500;

 export class UpdateStaffStatusDto {
   // ==========================================================================
   // 1. TRẠNG THÁI TÀI KHOẢN - BẮT BUỘC
   // ==========================================================================

   @IsDefined({ message: 'Cần cung cấp isActive để khóa hoặc mở khóa tài khoản.' })
   @IsBoolean({ message: 'isActive phải là Boolean True hoặc False trong JSON.' })
   isActive!: boolean;

   // ==========================================================================
   // 2. LÝ DO KHÓA / MỞ KHÓA - KHÔNG BẮT BUỘC
   // ==========================================================================
   @Transform(({ value }: { value: unknown }) => {
     if (typeof value !== 'string') {
       return value;
     }

     const trimmed = value.trim();
     return trimmed === '' ? undefined : trimmed;
   })
   @ValidateIf((_object, value: unknown) => value !== undefined)
   @IsString({ message: 'Lý do phải là chuỗi ký tự.' })
   @MaxLength(STAFF_STATUS_REASON_MAX_LENGTH, {
     message: `Lý do không được vượt quá ${STAFF_STATUS_REASON_MAX_LENGTH} ký tự.`,
   })
   @Matches(/^[^\u0000-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]*$/u, {
     message: 'Lý do không được chứa ký tự xuống dòng hoặc ký tự điều khiển.',
   })
   reason?: string;
 }
