import { Controller, Get, Post, Param, Query, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // ─── Workflows ────────────────────────────────────────────────────────────

  @Get('workflows')
  listWorkflows(
    @Query('companyId') companyId?: string,
    @Query('module') module?: string,
    @Query('category') category?: string,
  ) {
    return this.service.listWorkflows({ companyId, module, category });
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

  @Post('workflows/:id/uninstall')
  uninstallWorkflow(
    @Param('id') id: string,
    @Body() body: { companyId?: string },
  ) {
    if (!body.companyId) throw new BadRequestException('companyId is required');
    return this.service.uninstallWorkflow(id, body.companyId);
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  @Get('agents')
  listAgents(
    @Query('companyId') companyId?: string,
    @Query('role') role?: string,
    @Query('category') category?: string,
  ) {
    return this.service.listAgents({ companyId, role, category });
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

  @Post('agents/:id/uninstall')
  uninstallAgent(
    @Param('id') id: string,
    @Body() body: { companyId?: string },
  ) {
    if (!body.companyId) throw new BadRequestException('companyId is required');
    return this.service.uninstallAgent(id, body.companyId);
  }
}
