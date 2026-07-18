import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { SellpiaSalesService, parseCalendarDate } from './sellpia-sales.service';
import { SellpiaSalesIngestBodyDto, SellpiaSalesQueryDto } from './dto/sellpia-sales.dto';
import type {
  SellpiaSalesSummary,
  SellpiaSalesIngestResult,
} from '@kiditem/shared/dashboard';

@Controller('sellpia-sales')
export class SellpiaSalesController {
  constructor(private readonly service: SellpiaSalesService) {}

  // 확장 스크랩 결과 적재. 요청 범위를 원자 교체하므로 재수집은 멱등이다.
  @Post('ingest')
  async ingest(
    @Body() body: SellpiaSalesIngestBodyDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaSalesIngestResult> {
    return this.service.ingest(organizationId, body);
  }

  // 대시보드 '몰별 매출' 섹션 read. from/to 미지정 시 이번 달(KST) 1일 ~ 오늘.
  @Get()
  async getSummary(
    @Query() query: SellpiaSalesQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaSalesSummary> {
    // DTO 정규식만으로는 캘린더 무효 날짜(2026-06-31 등)가 통과해 read 범위가 밀린다.
    if (query.from && !parseCalendarDate(query.from)) {
      throw new BadRequestException('from은 유효한 날짜(YYYY-MM-DD)여야 합니다.');
    }
    if (query.to && !parseCalendarDate(query.to)) {
      throw new BadRequestException('to는 유효한 날짜(YYYY-MM-DD)여야 합니다.');
    }
    const { from, to } = resolveRange(query.from, query.to);
    if (from > to) {
      throw new BadRequestException('from은 to보다 이후일 수 없습니다.');
    }
    return this.service.getSummary(organizationId, from, to);
  }
}

function resolveRange(
  from: string | undefined,
  to: string | undefined,
): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth() + 1;
  const d = kstNow.getUTCDate();
  const today = `${y}-${pad(m)}-${pad(d)}`;
  const monthStart = `${y}-${pad(m)}-01`;
  return { from: from ?? monthStart, to: to ?? today };
}
