import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

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

export class ResolveSellpiaCandidateDto {
  @IsIn(['create_product', 'create_option', 'link_option', 'ignore'])
  action!: 'create_product' | 'create_option' | 'link_option' | 'ignore';

  @IsOptional() @IsString() @MaxLength(200) masterName?: string;
  @IsOptional() @IsUUID() masterProductId?: string;
  @IsOptional() @IsString() @MaxLength(100) optionName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) sku?: string;
  @IsOptional() @IsString() @MaxLength(100) barcode?: string | null;
  @IsOptional() @IsUUID() productOptionId?: string;
  @IsOptional() @IsInt() @Min(0) operatorInitialStock?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
