import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CoupangReconciliationLinkDto {
  @IsUUID()
  productOptionId!: string;
}

export class CoupangReconciliationIgnoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
