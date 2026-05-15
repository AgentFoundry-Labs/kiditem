import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { MarketplaceCatalogService } from '../../../application/service/marketplace-catalog.service';
import { ListMarketplaceQueryDto } from './dto';

@Controller('marketplace/agents')
export class MarketplaceAgentsController {
  constructor(private readonly catalog: MarketplaceCatalogService) {}

  @Get()
  listAgents(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListMarketplaceQueryDto,
  ) {
    return this.catalog.listAgents(organizationId, query);
  }

  @Get(':id')
  async getAgent(@Param('id') id: string) {
    const item = await this.catalog.getAgent(id);
    if (!item) throw new NotFoundException('Agent not found');
    return item;
  }

  /**
   * Agent install is not wired against the Agent OS definition registry.
   * Definitions are code-owned and are not cloned per-tenant from marketplace
   * rows. The endpoint is preserved as a stable surface but explicitly rejects
   * requests instead of silently succeeding or returning a partial result.
   */
  @Post(':id/install')
  installAgent(@Param('id') _id: string) {
    throw new BadRequestException(
      'Marketplace agent install is not available. Agent definitions are managed by Agent OS directly.',
    );
  }

  @Post(':id/uninstall')
  uninstallAgent(@Param('id') _id: string) {
    throw new BadRequestException(
      'Marketplace agent uninstall is not available. Agent definitions are managed by Agent OS directly.',
    );
  }
}
