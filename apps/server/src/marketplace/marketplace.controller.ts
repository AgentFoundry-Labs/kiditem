import { Controller, Get, Post, Param, Query, Body, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // ─── Workflows ────────────────────────────────────────────────────────────

  @Get('workflows')
  listWorkflows(
    @Query('module') module?: string,
    @Query('category') category?: string,
  ) {
    return this.service.listWorkflows({ module, category });
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
    @Body() body: { companyId?: string; params?: Record<string, any> },
  ) {
    return this.service.installWorkflow(id, body.companyId, body.params);
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  @Get('agents')
  listAgents(
    @Query('role') role?: string,
    @Query('category') category?: string,
  ) {
    return this.service.listAgents({ role, category });
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
    @Body() body: { companyId?: string; params?: Record<string, any> },
  ) {
    return this.service.installAgent(id, body.companyId, body.params);
  }
}
