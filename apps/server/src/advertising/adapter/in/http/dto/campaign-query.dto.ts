import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsUUID, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CampaignQueryDto {
  @IsOptional()
  @IsString()
  period?: string = '7d';

}

export class TrendsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  @IsOptional()
  @IsIn(['7d', '14d', 'month'])
  period?: '7d' | '14d' | 'month';
}

export class StrategyQueryDto {
  @IsOptional()
  @IsIn(['7d', '14d', 'month'])
  period?: '7d' | '14d' | 'month' = '14d';
}

/**
 * `/api/ads/products`. Account and stable campaign identity narrow the
 * product-grain rows to one exact campaign for the detail table.
 */
export class AdProductQueryDto {
  @IsOptional()
  @IsIn(['7d', '14d', 'month'])
  period?: '7d' | '14d' | 'month' = '14d';

  @ValidateIf((value) => value.campaignIdentity !== undefined)
  @IsUUID()
  channelAccountId?: string;

  @ValidateIf((value) => value.channelAccountId !== undefined)
  @IsString()
  campaignIdentity?: string;
}
