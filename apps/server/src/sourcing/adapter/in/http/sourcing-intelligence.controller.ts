import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { SourcingDecisionBatchService } from '../../../application/service/sourcing-decision-batch.service';
import { SourcingEvidenceLedgerService } from '../../../application/service/sourcing-evidence-ledger.service';
import { SourcingLaunchCandidateService } from '../../../application/service/sourcing-launch-candidate.service';
import { SourcingCollectionSourceControlService } from '../../../application/service/sourcing-collection-source-control.service';
import {
  AppendEvidenceObservationsDto,
  CreateDecisionBatchDto,
  CreateDecisionProcurementIntentDto,
  CreateLaunchCandidateDto,
  FinalizeEvidenceRunDto,
  StartEvidenceRunDto,
  SetSourcingCollectionSourceEnabledDto,
} from './dto/sourcing-intelligence.dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing/intelligence')
export class SourcingIntelligenceController {
  constructor(
    private readonly sourceControls: SourcingCollectionSourceControlService,
    private readonly evidence: SourcingEvidenceLedgerService,
    private readonly launchCandidates: SourcingLaunchCandidateService,
    private readonly decisions: SourcingDecisionBatchService,
  ) {}

  @Get('sources')
  listSources(@CurrentOrganization() organizationId: string) {
    return this.sourceControls.list(organizationId);
  }

  @Patch('sources/:sourceKey')
  @Roles('owner', 'admin')
  setSourceEnabled(
    @Param('sourceKey') sourceKey: string,
    @Body() body: SetSourcingCollectionSourceEnabledDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceControls.setEnabled({
      organizationId,
      sourceKey,
      enabled: body.enabled,
    });
  }

  @Post('evidence-runs')
  @Roles('owner', 'admin')
  startEvidenceRun(
    @Body() body: StartEvidenceRunDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.evidence.startRun({
      organizationId,
      triggeredByUserId: requireUserId(user),
      ...body,
      windowStartAt: toOptionalDate(body.windowStartAt),
      windowEndAt: toOptionalDate(body.windowEndAt),
    });
  }

  @Post('evidence-runs/:id/observations')
  @Roles('owner', 'admin')
  appendEvidence(
    @Param('id', ParseUUIDPipe) runId: string,
    @Body() body: AppendEvidenceObservationsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.evidence.appendObservations({
      organizationId,
      runId,
      observations: body.observations.map((observation) => ({
        ...observation,
        eventAt: new Date(observation.eventAt),
        observedAt: new Date(observation.observedAt),
        availableAt: new Date(observation.availableAt),
        revisionAt: toOptionalDate(observation.revisionAt),
      })),
    });
  }

  @Post('evidence-runs/:id/finalize')
  @Roles('owner', 'admin')
  finalizeEvidenceRun(
    @Param('id', ParseUUIDPipe) runId: string,
    @Body() body: FinalizeEvidenceRunDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.evidence.finalizeRun({
      organizationId,
      runId,
      ...body,
      watermarkEventAt: toOptionalDate(body.watermarkEventAt),
    });
  }

  @Get('evidence-runs/:id')
  getEvidenceRun(
    @Param('id', ParseUUIDPipe) runId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.evidence.getRun(organizationId, runId);
  }

  @Post('launch-candidates')
  @Roles('owner', 'admin')
  createLaunchCandidate(
    @Body() body: CreateLaunchCandidateDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.launchCandidates.create({
      organizationId,
      createdByUserId: requireUserId(user),
      ...body,
    });
  }

  @Get('launch-candidates')
  listLaunchCandidates(
    @CurrentOrganization() organizationId: string,
    @Query('productConceptVersionKey') productConceptVersionKey?: string,
    @Query('limit') limit?: string,
  ) {
    return this.launchCandidates.list({
      organizationId,
      productConceptVersionKey,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('launch-candidates/:id')
  getLaunchCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.launchCandidates.get(organizationId, id);
  }

  @Post('decision-batches')
  @Roles('owner', 'admin')
  createDecisionBatch(
    @Body() body: CreateDecisionBatchDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.decisions.create({
      organizationId,
      requestedByUserId: requireUserId(user),
      ...body,
    });
  }

  @Get('decision-batches/latest')
  latestDecisionBatch(@CurrentOrganization() organizationId: string) {
    return this.decisions.latest(organizationId);
  }

  @Get('decision-batches/:id')
  getDecisionBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.decisions.get(organizationId, id);
  }

  @Post('decision-items/:id/procurement-intents')
  @Roles('owner', 'admin')
  createProcurementIntent(
    @Param('id', ParseUUIDPipe) decisionItemId: string,
    @Body() body: CreateDecisionProcurementIntentDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.decisions.createProcurementIntent({
      organizationId,
      requestedByUserId: requireUserId(user),
      decisionItemId,
      ...body,
    });
  }
}

function requireUserId(user: AuthUser): string {
  if (!user.id) throw new UnauthorizedException('Authenticated user id is required');
  return user.id;
}

function toOptionalDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}
