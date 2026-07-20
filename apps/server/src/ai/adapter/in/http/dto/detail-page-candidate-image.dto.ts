import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 마켓 상세설명용 폭. 기본값은 쿠팡 권장 780px.
 * 760=쿠팡, 780=쿠팡 권장, 800=11번가, 860=네이버/G마켓.
 */
export class RenderCandidateDetailImageBodyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(320)
  @Max(2400)
  outputWidth?: number;
}
