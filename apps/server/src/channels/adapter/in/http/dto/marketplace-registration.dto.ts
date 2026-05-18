import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class MarketplaceRegistrationDto {
  @IsUUID()
  masterId!: string;

  @IsUUID()
  channelAccountId!: string;

  @IsString()
  @MaxLength(100)
  externalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  productBarcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  channelName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  channelPrice?: number | null;
}
