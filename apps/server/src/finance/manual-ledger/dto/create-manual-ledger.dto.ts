import { IsString, IsInt, IsOptional, IsIn, MinLength, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateManualLedgerDto {
  @IsDateString() date: string;
  @IsIn(['income', 'expense']) type: string;
  @IsString() @MinLength(1) category: string;
  @IsString() @IsOptional() counterpart?: string;
  @IsString() @IsOptional() description?: string;
  @Type(() => Number) @IsInt() amount: number;
  @Type(() => Number) @IsInt() @IsOptional() tax?: number;
}
