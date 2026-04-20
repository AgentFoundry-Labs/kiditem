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

  // 광고센터 익스텐션이 detectPeriod()에서 읽은 실제 데이터 기간 (YYYY-MM-DD)
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
