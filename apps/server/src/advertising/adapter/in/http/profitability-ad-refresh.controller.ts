import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import type { ProfitabilityAdRefreshPort } from '../../../application/port/in/profitability-ad-refresh.port';
import { PROFITABILITY_AD_REFRESH_PORT } from '../../../application/port/in/profitability-ad-refresh.port';
import { Inject } from '@nestjs/common';

const AttemptTokenSchema = z.string().uuid();
const FinalizeSliceSchema = z.object({
  sliceId: z.string().regex(/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/),
  collectionRunId: z.string().uuid(),
  completedTargetCount: z.number().int().nonnegative(),
}).strict();
const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ReportMetricSchema = z.number().int().nonnegative().max(2_147_483_647);
const ReportSliceSchema = z.object({
  collectionRunId: z.string().uuid(),
  advertiserId: z.string().trim().min(1).max(100),
  campaignCount: z.number().int().nonnegative().max(100_000),
  expectedRowCount: z.number().int().nonnegative().max(100_000),
  collectedRowCount: z.number().int().nonnegative().max(100_000),
  businessDates: z.array(CalendarDateSchema).min(1).max(31),
  rows: z.array(z.object({
    businessDate: CalendarDateSchema,
    externalOptionId: z.string().trim().min(1).max(100),
    adSpend: ReportMetricSchema,
    impressions: ReportMetricSchema,
    clicks: ReportMetricSchema,
    orders: ReportMetricSchema,
    conversions: ReportMetricSchema,
    adRevenue: ReportMetricSchema,
  }).strict()).max(100_000),
}).strict();

@Controller('ads/profitability-refresh/runs')
export class ProfitabilityAdRefreshController {
  constructor(
    @Inject(PROFITABILITY_AD_REFRESH_PORT)
    private readonly refresh: ProfitabilityAdRefreshPort,
  ) {}

  @Get(':operationRunId/next-slice')
  nextSlice(
    @CurrentOrganization() organizationId: string,
    @Param('operationRunId', new ParseUUIDPipe()) operationRunId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
  ) {
    return this.refresh.nextSlice({
      organizationId,
      operationRunId,
      attemptToken: attemptToken(rawAttemptToken),
    });
  }

  @Post(':operationRunId/slices/:sliceId/finalize')
  finalizeSlice(
    @CurrentOrganization() organizationId: string,
    @Param('operationRunId', new ParseUUIDPipe()) operationRunId: string,
    @Param('sliceId') sliceId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const parsed = FinalizeSliceSchema.safeParse({
      ...(typeof rawBody === 'object' && rawBody ? rawBody : {}),
      sliceId,
    });
    if (!parsed.success) throw new BadRequestException('invalid_profitability_ad_slice');
    return this.refresh.finalizeSlice({
      organizationId,
      operationRunId,
      attemptToken: attemptToken(rawAttemptToken),
      ...parsed.data,
    });
  }

  @Post(':operationRunId/slices/:sliceId/report')
  ingestReportSlice(
    @CurrentOrganization() organizationId: string,
    @Param('operationRunId', new ParseUUIDPipe()) operationRunId: string,
    @Param('sliceId') sliceId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    if (!SLICE_PATTERN.test(sliceId)) {
      throw new BadRequestException('invalid_profitability_ad_slice');
    }
    const parsed = ReportSliceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException('invalid_profitability_ad_report');
    }
    return this.refresh.ingestReportSlice({
      organizationId,
      operationRunId,
      attemptToken: attemptToken(rawAttemptToken),
      sliceId,
      report: parsed.data,
    });
  }

  @Post(':operationRunId/finalize')
  finalizeRun(
    @CurrentOrganization() organizationId: string,
    @Param('operationRunId', new ParseUUIDPipe()) operationRunId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
  ) {
    return this.refresh.finalizeRun({
      organizationId,
      operationRunId,
      attemptToken: attemptToken(rawAttemptToken),
    });
  }
}

const SLICE_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

function attemptToken(value: string | undefined): string {
  const parsed = AttemptTokenSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('invalid_operation_attempt_token');
  return parsed.data;
}
