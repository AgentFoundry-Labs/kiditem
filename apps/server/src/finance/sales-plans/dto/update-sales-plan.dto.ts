import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSalesPlanDto {
  @IsString() @IsOptional() period?: string;
  @Type(() => Number) @IsInt() @IsOptional() targetRevenue?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetOrders?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetProfit?: number;
  @Type(() => Number) @IsInt() @IsOptional() actualRevenue?: number;
  @Type(() => Number) @IsInt() @IsOptional() actualOrders?: number;
  @Type(() => Number) @IsInt() @IsOptional() actualProfit?: number;
  @IsString() @IsOptional() notes?: string;
}
