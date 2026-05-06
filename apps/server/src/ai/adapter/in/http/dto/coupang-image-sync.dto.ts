import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';

export class CoupangImageSyncRowDto {
  @IsString()
  inventoryId!: string;

  @IsOptional()
  @IsString()
  legacyCode?: string | null;

  @IsString()
  name!: string;

  @IsUrl({ require_tld: false })
  url!: string;
}

export class CoupangImageSyncRowsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => CoupangImageSyncRowDto)
  rows!: CoupangImageSyncRowDto[];
}
