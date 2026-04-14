import { IsString, IsOptional, IsInt, Min } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateStockAuditDto {
  @IsString() auditNumber: string;
  @IsOptional() items?: any;
  @IsInt() @Min(0) totalProducts: number;
  @IsString() @IsOptional() notes?: string;
}
