import { IsOptional, IsString, IsIn } from 'class-validator';

// products.service.ts getPipelineStats() 의 statusWhere 화이트리스트. 신규 값 추가 시 동기화 필요.
export const PIPELINE_STATS_STATUS_VALUES = [
  'all',
  'draft',
  'processing',
  'processed',
  'active',
  'paused',
  'deleted',
] as const;

export class PipelineStatsQueryDto {
  @IsString()
  @IsOptional()
  @IsIn(PIPELINE_STATS_STATUS_VALUES as unknown as string[])
  status?: string;
}
