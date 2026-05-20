import { IsString, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class CreateSettlementDto {
  @IsString() period: string;
  @Type(() => Number) @IsInt() expectedAmount: number;
  @Type(() => Number) @IsInt() @IsOptional() commission?: number;
  @Type(() => Number) @IsInt() @IsOptional() shippingFee?: number;
  @Type(() => Number) @IsInt() @IsOptional() orderCount?: number;
  @Type(() => Number) @IsInt() @IsOptional() returnCount?: number;
}
