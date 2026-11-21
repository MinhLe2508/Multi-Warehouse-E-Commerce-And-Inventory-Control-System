import { IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';
import type { BuyerRole } from '../../auth/auth.service';

export class ChangeStaffRoleDto {
  @IsIn([UserRole.CUSTOMER, UserRole.WAREHOUSE_STAFF])
  role!: BuyerRole;
}
