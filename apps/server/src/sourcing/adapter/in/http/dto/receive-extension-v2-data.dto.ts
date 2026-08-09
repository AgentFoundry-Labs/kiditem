import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ReceiveExtensionV2DataDto {
  @IsIn(['2'])
  schemaVersion!: '2';

  @IsUUID()
  collectionSessionId!: string;

  @IsIn(['1688', 'alibaba'])
  sourcePlatform!: '1688' | 'alibaba';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  sourceUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  externalOfferId!: string;

  @IsString()
  @MaxLength(300)
  variantKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsString()
  @MaxLength(64)
  capturedAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  extractorVersion!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMin!: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderQuantity!: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  supplierName!: string | null;

  @IsArray()
  @ArrayMaxSize(500)
  skuAttributes!: unknown[];

  @IsArray()
  @ArrayMaxSize(2_000)
  skuItems!: unknown[];

  @IsArray()
  @ArrayMaxSize(500)
  priceTiers!: unknown[];

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  rawPayloadHash!: string;
}
