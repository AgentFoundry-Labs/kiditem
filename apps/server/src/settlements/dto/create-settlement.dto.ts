import { IsString, IsUUID, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSettlementDto {
  @IsUUID() companyId: string;
  @IsString() period: string;
  @Type(() => Number) @IsInt() expectedAmount: number;
  @Type(() => Number) @IsInt() @IsOptional() commission?: number;
  @Type(() => Number) @IsInt() @IsOptional() shippingFee?: number;
  @Type(() => Number) @IsInt() @IsOptional() orderCount?: number;
  @Type(() => Number) @IsInt() @IsOptional() returnCount?: number;
}
