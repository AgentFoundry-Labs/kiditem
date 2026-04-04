import { IsString, IsOptional, IsUUID, IsInt, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSalesPlanDto {
  @IsUUID() companyId: string;
  @IsString() @MinLength(1) period: string; // "YYYY-MM"
  @Type(() => Number) @IsInt() @IsOptional() targetRevenue?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetOrders?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetProfit?: number;
  @IsString() @IsOptional() notes?: string;
}
