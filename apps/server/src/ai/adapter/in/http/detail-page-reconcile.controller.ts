import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { DetailPageAgentReconcileService } from '../../../application/service/detail-page-agent-reconcile.service';
import { ReconcileDetailPageBodyDto } from './dto/detail-page-reconcile.dto';

@Controller('ai/detail-page')
export class DetailPageReconcileController {
  constructor(private readonly reconcile: DetailPageAgentReconcileService) {}

  /**
   * Admin-triggered reconcile for the detail-page Agent OS pipeline.
   *
   * Replays terminal `AgentRunRequest` rows whose originating
   * `ContentGeneration` is still `PROCESSING` — recovery path for the
   * hot-path bus event. See agent-os/AGENTS.md "Recovery contract".
   *
   * Idempotent (the sink short-circuits when the row is already terminal),
   * so this can be invoked freely. Restricted to owner/admin to avoid
   * accidental load amplification.
   */
  @Post('reconcile-stuck')
  @Roles('owner', 'admin')
  reconcileStuck(
    @Body() body: ReconcileDetailPageBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.reconcile.reconcile(organizationId, {
      sinceMinutes: body.sinceMinutes,
      limit: body.limit,
    });
  }
}
