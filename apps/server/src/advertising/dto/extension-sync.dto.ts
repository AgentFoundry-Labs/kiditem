import { IsString, IsOptional, IsArray, IsObject, IsNumber, ValidateIf } from 'class-validator';

export class ExtensionSyncDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

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

  // Wave C2: extension 이 보내는 date-range 필드. 전역 `ValidationPipe({whitelist:true})`
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
