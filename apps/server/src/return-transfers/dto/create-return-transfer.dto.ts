import { IsString, IsOptional, IsUUID, IsInt, IsPositive } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateReturnTransferDto {
  @IsString() @IsOptional() orderId?: string;
  @IsUUID() productId: string;
  @IsString() @IsOptional() productName?: string;
  @IsInt() @IsPositive() quantity: number;
  @IsString() @IsOptional() notes?: string;
}
