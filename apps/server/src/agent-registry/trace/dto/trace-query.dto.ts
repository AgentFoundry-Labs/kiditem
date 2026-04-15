import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * `GET /api/agent-registry/tasks/:id/trace` query parameters.
 * runId 목록이 100건 초과 시 서비스 레이어가 커서로 슬라이스.
 * cursor 는 offset 문자열 (정수). limit 은 향후 확장 — 현재 서비스는 PAGE_LIMIT=100 고정.
 */
export class TraceQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
