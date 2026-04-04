import { IsString, IsOptional, IsUUID, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplierPaymentDto {
  @IsUUID() companyId: string;
  @IsUUID() supplierId: string;
  @Type(() => Number) @IsInt() amount: number;
  @IsDateString() @IsOptional() dueDate?: string;
  @IsUUID() @IsOptional() purchaseOrderId?: string;
  @IsString() @IsOptional() notes?: string;
}
