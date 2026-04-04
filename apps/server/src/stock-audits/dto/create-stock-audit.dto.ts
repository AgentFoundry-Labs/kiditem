import { IsString, IsOptional, IsInt, IsUUID, Min } from 'class-validator';

export class CreateStockAuditDto {
  @IsUUID() companyId: string;
  @IsString() auditNumber: string;
  @IsOptional() items?: any;
  @IsInt() @Min(0) totalProducts: number;
  @IsString() @IsOptional() notes?: string;
}
