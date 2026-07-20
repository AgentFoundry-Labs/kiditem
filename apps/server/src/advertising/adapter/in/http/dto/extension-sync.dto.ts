import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

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
   * Raw producer authority evidence. This intentionally accepts bounded future
   * values; the application authority resolver recognizes only the shared
   * producer enum and fails unknown values closed.
   */
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  campaignReportScope?: string;

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
