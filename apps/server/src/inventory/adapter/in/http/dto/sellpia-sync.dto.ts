import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ImportSellpiaWorkbookDto {
  @IsDateString()
  effectiveExportedAt!: string;
}

export class ApproveSellpiaItemDto {
  @IsInt() @Min(0) targetCurrentStock!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class IgnoreSellpiaItemDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateSellpiaReceiptBatchDto {
  @IsString() @MaxLength(50) sourceType!: string;
  @IsString() @MaxLength(200) sourceRef!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class MarkSellpiaReceiptBatchUploadedDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
