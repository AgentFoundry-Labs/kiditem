import { Body, Controller, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  SourcingBrowserTrendOperationService,
  type Browser1688TrendBatch,
  type BrowserTiktokCcTrendBatch,
} from '../../../application/service/sourcing-browser-trend-operation.service';

/** Fixed, fenced owner routes for browser trend Operation attempts. */
@Controller('sourcing/operations')
export class SourcingBrowserTrendOperationController {
  constructor(
    private readonly browserTrends: SourcingBrowserTrendOperationService,
  ) {}

  @Post('1688-trends/:runId/results')
  ingest1688Results(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Body() batch: Browser1688TrendBatch,
    @CurrentOrganization() organizationId: string,
    @Headers('x-operation-attempt-token') attemptToken: string | undefined,
  ) {
    return this.browserTrends.ingest1688({
      organizationId,
      operationRunId: runId,
      attemptToken: attemptToken ?? '',
      batch,
    });
  }

  @Post('1688-search/:runId/results')
  ingest1688SearchResults(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Body() batch: Browser1688TrendBatch,
    @CurrentOrganization() organizationId: string,
    @Headers('x-operation-attempt-token') attemptToken: string | undefined,
  ) {
    return this.browserTrends.ingest1688Search({
      organizationId,
      operationRunId: runId,
      attemptToken: attemptToken ?? '',
      batch,
    });
  }

  @Post('tiktok-cc-trends/:runId/results')
  ingestTiktokCcResults(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Body() batch: BrowserTiktokCcTrendBatch,
    @CurrentOrganization() organizationId: string,
    @Headers('x-operation-attempt-token') attemptToken: string | undefined,
  ) {
    return this.browserTrends.ingestTiktokCc({
      organizationId,
      operationRunId: runId,
      attemptToken: attemptToken ?? '',
      batch,
    });
  }
}
