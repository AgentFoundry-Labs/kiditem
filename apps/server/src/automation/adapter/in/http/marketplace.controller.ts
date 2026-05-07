import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { MarketplaceCatalogService } from '../../../application/service/marketplace-catalog.service';
import { MarketplaceInstallService } from '../../../application/service/marketplace-install.service';
import { ListMarketplaceQueryDto, InstallMarketplaceBodyDto } from './dto';

/**
 * Inbound HTTP adapter for the Marketplace surface, owned by the
 * Automation owner-domain. Catalog read/list go to
 * `MarketplaceCatalogService` (read-side projection); workflow install +
 * uninstall (the side-effecting paths) go through the
 * `MarketplaceInstallService` application service. Both live under
 * `automation/application/service/`.
 *
 * Agent install/uninstall endpoints respond with `BadRequestException`
 * because the legacy `AgentDefinition` table was retired in favor of
 * Agent OS `AgentBlueprint` (global) + `AgentInstance` (tenant). The
 * marketplace agent install path has not been re-wired yet — see
 * `apps/server/src/automation/adapter/out/panel-event/AGENTS.md`
 * "Not yet wired" subsection.
 */
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly catalog: MarketplaceCatalogService,
    private readonly install: MarketplaceInstallService,
  ) {}

  // ─── Workflows ────────────────────────────────────────────────────────────

  @Get('workflows')
  listWorkflows(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.catalog.listWorkflows(organizationId, query);
  }

  @Get('workflows/:id')
  async getWorkflow(@Param('id') id: string) {
    const item = await this.catalog.getWorkflow(id);
    if (!item) throw new NotFoundException('Workflow not found');
    return item;
  }

  @Post('workflows/:id/install')
  installWorkflow(
    @Param('id') id: string,
    @Body() body: InstallMarketplaceBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.install.installWorkflow(id, organizationId, body.params);
  }

  @Post('workflows/:id/uninstall')
  uninstallWorkflow(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.install.uninstallWorkflow(id, organizationId);
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  @Get('agents')
  listAgents(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.catalog.listAgents(organizationId, query);
  }

  @Get('agents/:id')
  async getAgent(@Param('id') id: string) {
    const item = await this.catalog.getAgent(id);
    if (!item) throw new NotFoundException('Agent not found');
    return item;
  }

  /**
   * Agent install is not wired against the new Agent OS catalog.
   * `AgentBlueprint` rows are global to Agent OS and are not cloned
   * per-tenant from marketplace rows. The endpoint is preserved as a
   * stable surface but explicitly rejects requests instead of silently
   * succeeding or returning a partial result.
   */
  @Post('agents/:id/install')
  installAgent(@Param('id') _id: string) {
    throw new BadRequestException(
      'Marketplace agent install is not available. Agent blueprints are managed by Agent OS directly.',
    );
  }

  @Post('agents/:id/uninstall')
  uninstallAgent(@Param('id') _id: string) {
    throw new BadRequestException(
      'Marketplace agent uninstall is not available. Agent blueprints are managed by Agent OS directly.',
    );
  }
}
