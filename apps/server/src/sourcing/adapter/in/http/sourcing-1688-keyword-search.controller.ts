import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { canonicalizeSourcingWingCatalogKeyword } from '@kiditem/shared/sourcing';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import { Sourcing1688KeywordSearchService } from '../../../application/service/sourcing-1688-keyword-search.service';
import { Search1688KeywordDto } from './dto';

@Controller('sourcing/1688/keyword-search')
export class Sourcing1688KeywordSearchController {
  constructor(
    private readonly keywordSearch: Sourcing1688KeywordSearchService,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operationRunner: OperationRunnerPort,
  ) {}

  @Get('status')
  status(@CurrentOrganization() _organizationId: string) {
    return this.keywordSearch.getStatus();
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  searchByKeyword(
    @Body() body: Search1688KeywordDto,
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operationRunner.start({
      organizationId,
      operationKey: 'sourcing.search_1688_keyword_batch',
      triggerSource: 'domain_screen',
      input: { keywords: [canonicalizeSourcingWingCatalogKeyword(body.keyword)] },
      requestedByUserId: user.id,
      idempotencyKey: idempotencyKey?.trim() || null,
    });
  }
}
