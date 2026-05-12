import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CampaignQueryDto {
  @IsOptional()
  @IsString()
  period?: string = '7d';

  @IsOptional()
  @IsString()
  campaign?: string;
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
