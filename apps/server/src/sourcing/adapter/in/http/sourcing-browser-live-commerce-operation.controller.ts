import { Body, Controller, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  SourcingBrowserLiveCommerceOperationService,
  type BrowserLiveCommerceBatch,
} from '../../../application/service/sourcing-browser-live-commerce-operation.service';

/** Fixed owner endpoint for the browser live-commerce Operation lane. */
@Controller('sourcing/operations')
export class SourcingBrowserLiveCommerceOperationController {
  constructor(
    private readonly browserLiveCommerce: SourcingBrowserLiveCommerceOperationService,
  ) {}

  @Post('live-commerce/:runId/results')
  ingestResults(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Body() batch: BrowserLiveCommerceBatch,
    @CurrentOrganization() organizationId: string,
    @Headers('x-operation-attempt-token') attemptToken: string | undefined,
  ) {
    return this.browserLiveCommerce.ingest({
      organizationId,
      operationRunId: runId,
      attemptToken: attemptToken ?? '',
      batch,
    });
  }
}
