import { IsString, IsOptional, IsUUID, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class CreateSupplierPaymentDto {
  @IsUUID() supplierId: string;
  @Type(() => Number) @IsInt() amount: number;
  @IsDateString() @IsOptional() dueDate?: string;
  @IsUUID() @IsOptional() purchaseOrderId?: string;
  @IsString() @IsOptional() notes?: string;
}
