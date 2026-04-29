import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { MarketplaceService } from '../../../../marketplace/marketplace.service';
import { MarketplaceInstallService } from '../../../application/service/marketplace-install.service';
import { ListMarketplaceQueryDto, InstallMarketplaceBodyDto } from './dto';

/**
 * Inbound HTTP adapter for the Marketplace surface, owned by the
 * Automation owner-domain. Catalog read/list go to the read-side
 * `MarketplaceService` (which still lives next to the catalog data in
 * `apps/server/src/marketplace/`); install + uninstall (the side-
 * effecting paths) go through the `MarketplaceInstallService`
 * application service.
 *
 * Route shape, DTOs, and response payloads are unchanged from the
 * pre-Phase-3C-3 controller — this is a structural move, not a
 * behavior change.
 */
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly catalog: MarketplaceService,
    private readonly install: MarketplaceInstallService,
  ) {}

  // ─── Workflows ────────────────────────────────────────────────────────────

  @Get('workflows')
  listWorkflows(
    @CurrentCompany() companyId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.catalog.listWorkflows(companyId, query);
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
    @CurrentCompany() companyId: string,
  ) {
    return this.install.installWorkflow(id, companyId, body.params);
  }

  @Post('workflows/:id/uninstall')
  uninstallWorkflow(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.install.uninstallWorkflow(id, companyId);
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  @Get('agents')
  listAgents(
    @CurrentCompany() companyId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.catalog.listAgents(companyId, query);
  }

  @Get('agents/:id')
  async getAgent(@Param('id') id: string) {
    const item = await this.catalog.getAgent(id);
    if (!item) throw new NotFoundException('Agent not found');
    return item;
  }

  @Post('agents/:id/install')
  installAgent(
    @Param('id') id: string,
    @Body() body: InstallMarketplaceBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.install.installAgent(id, companyId, body.params);
  }

  @Post('agents/:id/uninstall')
  uninstallAgent(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.install.uninstallAgent(id, companyId);
  }
}
