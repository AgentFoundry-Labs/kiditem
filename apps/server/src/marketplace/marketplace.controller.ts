import { Controller, Get, Post, Param, Query, Body, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import {
  ListMarketplaceQueryDto,
  InstallMarketplaceBodyDto,
  UninstallMarketplaceBodyDto,
} from './dto';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // ─── Workflows ────────────────────────────────────────────────────────────

  @Get('workflows')
  listWorkflows(@Query() query: ListMarketplaceQueryDto) {
    return this.service.listWorkflows(query);
  }

  @Get('workflows/:id')
  async getWorkflow(@Param('id') id: string) {
    const item = await this.service.getWorkflow(id);
    if (!item) throw new NotFoundException('Workflow not found');
    return item;
  }

  @Post('workflows/:id/install')
  installWorkflow(@Param('id') id: string, @Body() body: InstallMarketplaceBodyDto) {
    return this.service.installWorkflow(id, body.companyId, body.params);
  }

  @Post('workflows/:id/uninstall')
  uninstallWorkflow(@Param('id') id: string, @Body() body: UninstallMarketplaceBodyDto) {
    return this.service.uninstallWorkflow(id, body.companyId);
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  @Get('agents')
  listAgents(@Query() query: ListMarketplaceQueryDto) {
    return this.service.listAgents(query);
  }

  @Get('agents/:id')
  async getAgent(@Param('id') id: string) {
    const item = await this.service.getAgent(id);
    if (!item) throw new NotFoundException('Agent not found');
    return item;
  }

  @Post('agents/:id/install')
  installAgent(@Param('id') id: string, @Body() body: InstallMarketplaceBodyDto) {
    return this.service.installAgent(id, body.companyId, body.params);
  }

  @Post('agents/:id/uninstall')
  uninstallAgent(@Param('id') id: string, @Body() body: UninstallMarketplaceBodyDto) {
    return this.service.uninstallAgent(id, body.companyId);
  }
}
