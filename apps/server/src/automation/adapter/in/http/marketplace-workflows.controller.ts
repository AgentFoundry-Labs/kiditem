import {
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
import { InstallMarketplaceBodyDto, ListMarketplaceQueryDto } from './dto';

@Controller('marketplace/workflows')
export class MarketplaceWorkflowsController {
  constructor(
    private readonly catalog: MarketplaceCatalogService,
    private readonly install: MarketplaceInstallService,
  ) {}

  @Get()
  listWorkflows(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.catalog.listWorkflows(organizationId, query);
  }

  @Get(':id')
  async getWorkflow(@Param('id') id: string) {
    const item = await this.catalog.getWorkflow(id);
    if (!item) throw new NotFoundException('Workflow not found');
    return item;
  }

  @Post(':id/install')
  installWorkflow(
    @Param('id') id: string,
    @Body() body: InstallMarketplaceBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.install.installWorkflow(id, organizationId, body.params);
  }

  @Post(':id/uninstall')
  uninstallWorkflow(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.install.uninstallWorkflow(id, organizationId);
  }
}
