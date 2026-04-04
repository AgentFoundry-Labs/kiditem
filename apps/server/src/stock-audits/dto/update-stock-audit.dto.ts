import { IsString, IsOptional, IsInt, IsDateString, Min } from 'class-validator';

export class UpdateStockAuditDto {
  @IsString() @IsOptional() status?: string;
  @IsInt() @Min(0) @IsOptional() matchedCount?: number;
  @IsInt() @Min(0) @IsOptional() diffCount?: number;
  @IsOptional() items?: any;
  @IsDateString() @IsOptional() completedAt?: string;
  @IsString() @IsOptional() notes?: string;
}
