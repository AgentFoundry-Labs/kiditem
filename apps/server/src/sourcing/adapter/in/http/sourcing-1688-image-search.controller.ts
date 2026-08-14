import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import { Sourcing1688ImageSearchService } from '../../../application/service/sourcing-1688-image-search.service';
import { Search1688ImageDto } from './dto';

@Controller('sourcing/1688/image-search')
export class Sourcing1688ImageSearchController {
  constructor(
    private readonly imageSearch: Sourcing1688ImageSearchService,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operationRunner: OperationRunnerPort,
  ) {}

  @Get('status')
  status(@CurrentOrganization() _organizationId: string) {
    return this.imageSearch.getStatus();
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  searchByImage(
    @Body() body: Search1688ImageDto,
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operationRunner.start({
      organizationId,
      operationKey: 'sourcing.match_wholesale_images',
      triggerSource: 'domain_screen',
      input: { targetIds: [body.targetId.trim()] },
      requestedByUserId: user.id,
      idempotencyKey: idempotencyKey?.trim() || null,
    });
  }
}
