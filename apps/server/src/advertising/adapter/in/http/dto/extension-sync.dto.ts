import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class ExtensionSyncDto {
  @IsOptional()
  @MaxLength(160)
  @Matches(/^authoritative-rebuild:[1-9][0-9]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  idempotencyKey?: string;

  @IsOptional()
  @IsUUID()
  channelAccountId?: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  /**
   * `ad_campaign` projection contract.
   *
   * Dashboard date collection contains rows from many campaigns and is raw
   * audit evidence only; the exact account/day total is written separately by
   * `coupang_ads_daily`. Only the per-campaign sweep may replace campaign/day
   * target facts.
   */
  @IsOptional()
  @IsIn(['single_campaign_authoritative', 'multi_campaign_raw'])
  campaignReportScope?:
    | 'single_campaign_authoritative'
    | 'multi_campaign_raw';

  @IsOptional()
  @IsString()
  dashboardOnOff?: string;

  @IsOptional()
  @IsString()
  dashboardStatus?: string;

  // Wing 익스텐션은 숫자(일수), 광고센터 익스텐션은 "7d"/"14d" 문자열을 보냄
  @IsOptional()
  @ValidateIf((o) => typeof o.period === 'string')
  @IsString()
  @ValidateIf((o) => typeof o.period === 'number')
  @IsNumber()
  period?: string | number;

  @IsOptional()
  @IsArray()
  data?: any[];

  @IsOptional()
  @IsArray()
  normalizedRows?: any[];

  @IsOptional()
  @IsObject()
  kpis?: Record<string, any>;

  @IsOptional()
  @IsObject()
  summary?: Record<string, any>;

  @IsOptional()
  @IsObject()
  adSummary?: Record<string, any>;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  // extension 이 보내는 date-range 필드. 전역 `ValidationPipe({whitelist:true})`
  // 가 미선언 필드를 strip 하므로 명시적으로 받아두고, AdSyncService 가
  // ChannelScrapeRun.periodStart / periodEnd 로 매핑한다.
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsArray()
  headers?: string[];

  @IsOptional()
  @IsString()
  pageType?: string;
}
