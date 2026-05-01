import { IsUUID, IsInt, Min, IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateReturnTransferDto {
  @IsUUID() optionId!: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @MaxLength(20) condition?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
