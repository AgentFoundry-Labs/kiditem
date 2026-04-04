import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';

export class SupplierStatsQueryDto {
  @IsIn(['sales', 'productSales', 'history']) type: string;
  @IsString() @IsOptional() companyId?: string;
  @IsUUID() @IsOptional() supplierId?: string;
}
