import { Controller, Get, Query } from '@nestjs/common';
import { ProfitLossService } from '../services/profit-loss.service';
import { ProfitLossQueryDto } from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('profit-loss')
export class ProfitLossController {
  constructor(private readonly profitLossService: ProfitLossService) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ProfitLossQueryDto,
  ) {
    const { year, month } = this.resolvePeriod(query.period);
    return this.profitLossService.findAll(companyId, year, month);
  }

  /**
   * `YYYY-MM` → `{ year, month }`. DTO `@Matches` 가 포맷을 보장하므로 여기서는 split 안전.
   * 미입력 시 현재 시점 연/월 fallback (finance/CLAUDE.md §2).
   *
   * Note: JS `new Date()` 는 로컬 TZ 이지만, Plan B2c 에서 프로세스가 KST 로 운영된다는 전제.
   * (ProfitLoss 는 집계 결과이므로 초 단위 TZ 민감도 낮음 — 월 경계 다음 요청 시 다른 월 반환.)
   */
  private resolvePeriod(period?: string): { year: number; month: number } {
    if (period) {
      const [y, m] = period.split('-').map(Number);
      return { year: y, month: m };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}
