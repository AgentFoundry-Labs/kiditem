import { IsOptional, IsString, Matches } from 'class-validator';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from '../../dto/finance-period';

/**
 * `GET /api/profit-loss?period=YYYY-MM` — query DTO.
 *
 * `period` 는 `YYYY-MM` 형식 (월 단위만 지원, date range 로 확장 금지).
   * 미입력 시 controller 가 현재 KST 연/월로 fallback (finance/CLAUDE.md).
 *
 * Plan B2c.dashboard v2 R-02 — `@Matches` 로 split('-') 전 정규식 검증.
 * 값이 `2026-4` / `26-04` / `2026-00` / `2026-13` / `random` 이면 `BadRequestException` (ValidationPipe 자동 변환).
 */
export class ProfitLossQueryDto {
  @IsOptional()
  @IsString()
  @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE })
  period?: string;
}
