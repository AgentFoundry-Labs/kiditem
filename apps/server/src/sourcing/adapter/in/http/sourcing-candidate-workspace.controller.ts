import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { parseRequiredIdempotencyKey } from '../../../../common/http/required-idempotency-key';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingPromotionService } from '../../../application/service/sourcing-promotion.service';
import { SourcingService } from '../../../application/service/sourcing.service';
import { SourcingWorkspaceArchiveService } from '../../../application/service/sourcing-workspace-archive.service';
import {
  QuickProcessCandidateDto,
  RejectCandidateBodyDto,
} from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing')
export class SourcingCandidateWorkspaceController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly promotionSvc: SourcingPromotionService,
    private readonly workspaceArchive: SourcingWorkspaceArchiveService,
  ) {}

  @Get(':id')
  getProduct(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.getProduct(id, organizationId);
  }

  @Post('candidates/:id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: RejectCandidateBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.promotionSvc.reject(id, organizationId, body, user.id ?? null);
  }

  @Post('candidates/:id/quick-process')
  async quickProcess(
    @Param('id') id: string,
    @Body() body: QuickProcessCandidateDto | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.sourcingService.quickProcessCandidate(
      id,
      organizationId,
      user.id ?? null,
      body?.task ?? 'all',
      parseRequiredIdempotencyKey(idempotencyKey),
    );
  }

  @Delete('candidates/:id')
  deleteCandidate(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.workspaceArchive.archive(id, organizationId);
  }
}
