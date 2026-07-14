import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { SourcingPromotionService } from '../../../application/service/sourcing-promotion.service';
import { SourcingService } from '../../../application/service/sourcing.service';
import { SourcingWorkspaceArchiveService } from '../../../application/service/sourcing-workspace-archive.service';
import { ProductRegistrationService } from '../../../application/service/product-registration.service';
import {
  CreateProductPreparationDto,
  QuickProcessCandidateDto,
  RejectCandidateBodyDto,
  UpdateProductPreparationDto,
} from './dto';

@Controller('sourcing')
export class SourcingCandidateWorkspaceController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly promotionSvc: SourcingPromotionService,
    private readonly workspaceArchive: SourcingWorkspaceArchiveService,
    private readonly productRegistration: ProductRegistrationService,
  ) {}

  @Get(':id')
  getProduct(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.getProduct(id, organizationId);
  }

  @Post('candidates/:id/preparations')
  createPreparation(
    @Param('id') id: string,
    @Body() body: CreateProductPreparationDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productRegistration.createDraft(organizationId, id, user.id ?? null, body);
  }

  @Patch('preparations/:id')
  updatePreparation(
    @Param('id') id: string,
    @Body() body: UpdateProductPreparationDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productRegistration.updateDraft(organizationId, id, user.id ?? null, body);
  }

  @Post('preparations/:id/submit')
  submitPreparation(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productRegistration.submit(organizationId, id, user.id ?? null);
  }

  @Post('preparations/:id/cancel')
  cancelPreparation(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productRegistration.cancel(organizationId, id, user.id ?? null);
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
  ) {
    return this.sourcingService.quickProcessCandidate(id, organizationId, user.id ?? null, body?.task ?? 'all');
  }

  @Delete('candidates/:id')
  deleteCandidate(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.workspaceArchive.archive(id, organizationId);
  }
}
