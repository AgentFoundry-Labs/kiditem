import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSupplierPaymentDto {
  @Type(() => Number) @IsInt() @IsOptional() paidAmount?: number;
  @IsDateString() @IsOptional() paidDate?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() notes?: string;
}
