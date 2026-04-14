import { IsString, IsOptional, IsInt, IsUUID, IsPositive } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateStockTransferDto {
  @IsUUID() productId: string;
  @IsUUID() fromWarehouseId: string;
  @IsUUID() toWarehouseId: string;
  @IsInt() @IsPositive() quantity: number;
  @IsString() @IsOptional() notes?: string;
}
