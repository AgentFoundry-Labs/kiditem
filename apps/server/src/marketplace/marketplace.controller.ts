import { Controller, Get, Post, Param, Query, Body, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import {
  ListMarketplaceQueryDto,
  InstallMarketplaceBodyDto,
} from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // ─── Workflows ────────────────────────────────────────────────────────────

  @Get('workflows')
  listWorkflows(
    @CurrentCompany() companyId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.service.listWorkflows(companyId, query);
  }

  @Get('workflows/:id')
  async getWorkflow(@Param('id') id: string) {
    const item = await this.service.getWorkflow(id);
    if (!item) throw new NotFoundException('Workflow not found');
    return item;
  }

  @Post('workflows/:id/install')
  installWorkflow(
    @Param('id') id: string,
    @Body() body: InstallMarketplaceBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.service.installWorkflow(id, companyId, body.params);
  }

  @Post('workflows/:id/uninstall')
  uninstallWorkflow(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.service.uninstallWorkflow(id, companyId);
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  @Get('agents')
  listAgents(
    @CurrentCompany() companyId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.service.listAgents(companyId, query);
  }

  @Get('agents/:id')
  async getAgent(@Param('id') id: string) {
    const item = await this.service.getAgent(id);
    if (!item) throw new NotFoundException('Agent not found');
    return item;
  }

  @Post('agents/:id/install')
  installAgent(
    @Param('id') id: string,
    @Body() body: InstallMarketplaceBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.service.installAgent(id, companyId, body.params);
  }

  @Post('agents/:id/uninstall')
  uninstallAgent(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.service.uninstallAgent(id, companyId);
  }
}
