// =============================================================================
// Mục đích: Custom Validator cho class-validator 
// Kiểm tra độ dài theo số BYTE UTF-8 của mật khẩu, không phải số ký tự
// =============================================================================

import { registerDecorator, ValidationOptions, ValidationArguments,} from 'class-validator';

// Giới hạn số BYTE UTF-8 tối đa cho mật khẩu
// Khớp chính xác với hằng số ngầm định trong "AuthService.validateNewPassword()" (bcrypt chỉ dùng tối đa 72 byte đầu)
// Đặt thành hằng số export để nơi khác có thể tham chiếu lại đúng 1 nguồn duy nhất, tránh hard-code số "72" rải rác
export const PASSWORD_MAX_BYTES = 72;

// Giới hạn số ký tự tối thiểu cho mật khẩu
// Khớp với "AuthService.validateNewPassword()": "password.length < 8"
export const PASSWORD_MIN_LENGTH = 8;

// Decorator validate áp dụng lên field mật khẩu trong DTO, kiểm tra đồng thời 2 điều kiện
// Độ dài tối thiểu thưo số ký tự
// Độ dài tối đa theo số BYTE UTF-8
export function IsPasswordByteLength(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPasswordByteLength',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return true;
          }

          const isLongEnough = value.length >= PASSWORD_MIN_LENGTH;
          const isWithinByteLimit = Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES;

          return isLongEnough && isWithinByteLimit;
        },

        defaultMessage(args: ValidationArguments): string {
          const value = args.value;

          if (typeof value !== 'string') { return 'Mật khẩu phải là chuỗi ký tự.'; }
          if (value.length < PASSWORD_MIN_LENGTH) { return `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`; }

          return `Mật khẩu không được vượt quá ${PASSWORD_MAX_BYTES} Byte khi mã hóa UTF-8.`;
        },
      },
    });
  };
}
