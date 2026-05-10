import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { COUPANG_IMAGE_SYNC_ROW_SOURCES } from '@kiditem/shared/ai';

class CoupangImageSyncRowDto {
  @IsString()
  inventoryId!: string;

  @IsOptional()
  @IsString()
  legacyCode?: string | null;

  @IsString()
  name!: string;

  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsIn(COUPANG_IMAGE_SYNC_ROW_SOURCES)
  source?: 'extension' | 'server_scraper';
}

export class CoupangImageSyncRowsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => CoupangImageSyncRowDto)
  rows!: CoupangImageSyncRowDto[];
}
