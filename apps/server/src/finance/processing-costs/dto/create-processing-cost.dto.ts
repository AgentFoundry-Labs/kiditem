import { IsString, IsOptional, IsUUID, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateProcessingCostDto {
  @IsUUID() masterId: string;
  @IsString() processType: string;
  @Type(() => Number) @IsInt() unitCost: number;
  @Type(() => Number) @IsInt() quantity: number;
  @IsString() @IsOptional() vendor?: string;
  @IsDateString() @IsOptional() date?: string;
  @IsString() @IsOptional() notes?: string;
}
