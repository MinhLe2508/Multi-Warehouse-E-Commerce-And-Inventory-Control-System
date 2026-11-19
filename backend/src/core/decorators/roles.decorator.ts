// Định nghĩa Custom Decorator "@Roles(...)"
// Cho phép gắn metadata "vai trò nào được phép gọi endpoint này" ngay trên Controller hoặc trên từng method handler

import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

// Metadata key dùng chung giữa Roles Decorator và RolesGuard
export const ROLES_KEY = 'roles';

// Đánh dấu danh sách role được phép truy cập.
// Yêu cầu ít nhất một UserRole.
// Ví dụ:
//  @Roles(UserRole.ADMIN)
//  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
export const Roles = (...roles: [UserRole, ...UserRole[]]) =>
  SetMetadata(ROLES_KEY, roles);
