import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const AD_EXPORT_GRADES = ['A', 'B', 'C', 'all'] as const;
const AD_EXPORT_METRICS = [
  'spend',
  'revenue',
  'impressions',
  'clicks',
  'conversions',
  'roas',
  'ctr',
  'cvr',
] as const;

export type AdExportGrade = (typeof AD_EXPORT_GRADES)[number];
export type AdExportMetric = (typeof AD_EXPORT_METRICS)[number];

/** The browser sends the already loaded strategy rows; the server only builds bytes. */
export class AdCampaignExportDto {
  @IsIn(AD_EXPORT_GRADES)
  grade!: AdExportGrade;

  @IsArray()
  @IsObject({ each: true })
  actions!: unknown[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget!: number;
}

export class AdTrendExportPointDto {
  @IsString()
  businessDate!: string;

  @IsString()
  axisLabel!: string;

  /** `null` for a date the campaign sweep never measured; the cell stays empty. */
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  leftValue!: number | null;

  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  rightValue!: number | null;
}

export class AdTrendExportDto {
  @IsIn(['7d', '14d', 'month'])
  period!: '7d' | '14d' | 'month';

  @IsIn(AD_EXPORT_METRICS)
  leftMetric!: AdExportMetric;

  @IsIn(AD_EXPORT_METRICS)
  rightMetric!: AdExportMetric;

  @IsString()
  leftLabel!: string;

  @IsString()
  rightLabel!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdTrendExportPointDto)
  points!: AdTrendExportPointDto[];
}
