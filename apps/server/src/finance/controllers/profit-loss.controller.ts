import { Controller, Get, Query } from '@nestjs/common';
import { ProfitLossService } from '../services/profit-loss.service';
import { ProfitLossQueryDto } from '../dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { kstBusinessDate } from '../../common/kst';

@Controller('profit-loss')
export class ProfitLossController {
  constructor(private readonly profitLossService: ProfitLossService) {}

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ProfitLossQueryDto,
  ) {
    // The request's instant decides the default month and which of its KST
    // days are closed; nothing below reads the clock again.
    const now = new Date();
    const { year, month } = this.resolvePeriod(query.period, now);
    return this.profitLossService.findAll(organizationId, year, month, now);
  }

  /**
   * `YYYY-MM` → `{ year, month }`. DTO `@Matches` 가 포맷을 보장하므로 여기서는 split 안전.
   * 미입력 시 `now` 의 KST 연/월로 fallback (finance/CLAUDE.md).
   */
  private resolvePeriod(period: string | undefined, now: Date): { year: number; month: number } {
    if (period) {
      const [y, m] = period.split('-').map(Number);
      return { year: y, month: m };
    }
    const today = kstBusinessDate(now);
    return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  }
}
