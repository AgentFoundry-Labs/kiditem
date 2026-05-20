import { IsString, IsOptional, IsInt, Min } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class CreateStockAuditDto {
  @IsString() auditNumber: string;
  @IsOptional() items?: any;
  @IsInt() @Min(0) totalProducts: number;
  @IsString() @IsOptional() notes?: string;
}
