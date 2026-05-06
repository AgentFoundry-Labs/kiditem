import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Single row received from the Coupang Wing scrape (or other source).
 *
 * `organizationId` is intentionally NOT a field — the server resolves the
 * tenant from `@CurrentOrganization()`. Any client-supplied `organizationId`
 * is dropped by `ValidationPipe({ whitelist: true })`.
 */
export class CoupangReconciliationRowDto {
  @IsString()
  @MaxLength(100)
  externalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalOptionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legacyCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  channelProductName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  channelOptionName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  channelImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  channelUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  channelStatus?: string | null;
}

export class CoupangReconciliationScanDto {
  @IsOptional()
  @IsIn(['wing_inventory', 'seller_products', 'manual'])
  source?: 'wing_inventory' | 'seller_products' | 'manual';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5_000)
  @ValidateNested({ each: true })
  @Type(() => CoupangReconciliationRowDto)
  rows!: CoupangReconciliationRowDto[];
}
