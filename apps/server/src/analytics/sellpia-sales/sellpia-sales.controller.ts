import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { SellpiaSalesService, parseCalendarDate } from './sellpia-sales.service';
import {
  SellpiaSalesIngestBodyDto,
  SellpiaSalesQueryDto,
  SellpiaSalesSourceFailureDto,
} from './dto/sellpia-sales.dto';
import {
  normalizeSellpiaSalesSourceRequest,
  SellpiaSalesSourceService,
} from './sellpia-sales-source.service';
import type {
  SellpiaSalesSummary,
} from '@kiditem/shared/dashboard';
import {
  businessDateKey,
  closedMonthRangeFromCutoff,
  evidenceCutoffDate,
  shiftBusinessDateKey,
} from '../../common/kst';

@Controller('sellpia-sales')
export class SellpiaSalesController {
  constructor(
    private readonly service: SellpiaSalesService,
    private readonly source: SellpiaSalesSourceService,
  ) {}

  @Post('attempts')
  beginAttempt(
    @Body() rawBody: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.source.beginAttempt(
      organizationId,
      idempotencyKey,
      normalizeSellpiaSalesSourceRequest(rawBody),
    );
  }

  @Get('attempts/:attemptId')
  async readAttempt(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    const attempt = await this.source.readAttempt(organizationId, attemptId);
    if (!attempt) throw new NotFoundException('SELLPIA_SALES_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Get('attempts/:attemptId/control')
  async readAttemptControl(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    const attempt = await this.source.readAttemptControl(organizationId, attemptId);
    if (!attempt) throw new NotFoundException('SELLPIA_SALES_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Post('attempts/:attemptId/complete')
  completeAttempt(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() body: SellpiaSalesIngestBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    if (!attemptToken) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
    return this.source.completeAttempt(organizationId, attemptId, attemptToken, body);
  }

  @Post('attempts/:attemptId/fail')
  failAttempt(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() body: SellpiaSalesSourceFailureDto,
    @CurrentOrganization() organizationId: string,
  ) {
    if (!attemptToken) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
    return this.source.failAttempt(
      organizationId,
      attemptId,
      attemptToken,
      body.errorCode,
      body.errorMessage,
    );
  }

  // 대시보드 '몰별 매출' read. 기본 범위는 현재 KST 월의 닫힌 날짜만 포함한다.
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
    if (!query.from && !query.to) {
      return this.service.getClosedMonthSummary(organizationId);
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
  const knownThrough = businessDateKey(evidenceCutoffDate());
  const closedMonthRange = closedMonthRangeFromCutoff(knownThrough);
  const anchorDate = shiftBusinessDateKey(knownThrough, 1);
  return {
    from: from ?? closedMonthRange?.from ?? `${anchorDate.slice(0, 7)}-01`,
    to: to ?? knownThrough,
  };
}
