import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { SourcingPromotionService } from '../../../application/service/sourcing-promotion.service';
import { SourcingService } from '../../../application/service/sourcing.service';
import { SourcingWorkspaceArchiveService } from '../../../application/service/sourcing-workspace-archive.service';
import { PromoteCandidateBodyDto, RejectCandidateBodyDto } from './dto';

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

  @Post('candidates/:id/promote')
  async promote(
    @Param('id') id: string,
    @Body() body: PromoteCandidateBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.promotionSvc.promote(id, organizationId, body);
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

  @Delete('candidates/:id')
  deleteCandidate(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.workspaceArchive.archive(id, organizationId);
  }
}
