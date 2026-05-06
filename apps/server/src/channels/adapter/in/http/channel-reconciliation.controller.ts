import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ChannelReconciliationService } from '../../../application/service/channel-reconciliation.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CoupangReconciliationIgnoreDto,
  CoupangReconciliationLinkDto,
  CoupangReconciliationListQueryDto,
  CoupangReconciliationScanDto,
} from './dto';
import { ChannelReconciliationSnapshotService } from '../../../application/service/channel-reconciliation-snapshot.service';

@Controller('channels/reconciliation/coupang')
export class ChannelReconciliationController {
  constructor(
    private readonly service: ChannelReconciliationService,
    private readonly snapshotService: ChannelReconciliationSnapshotService,
  ) {}

  @Post('scan-from-rows')
  async scanFromRows(
    @Body() body: CoupangReconciliationScanDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.scanFromRows(
      organizationId,
      body.rows,
      body.source ?? 'wing_inventory',
    );
  }

  @Post('sync-from-snapshots')
  async syncFromSnapshots(@CurrentOrganization() organizationId: string) {
    return this.snapshotService.syncFromSnapshots(organizationId);
  }

  @Get('summary')
  async getSummary(@CurrentOrganization() organizationId: string) {
    return this.service.getSummary(organizationId);
  }

  @Get('items')
  async listItems(
    @CurrentOrganization() organizationId: string,
    @Query() query: CoupangReconciliationListQueryDto,
  ) {
    return this.service.listItems(organizationId, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      resolutionSource: query.resolutionSource,
      search: query.search,
    });
  }

  @Post('items/:id/link')
  async linkItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CoupangReconciliationLinkDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.linkItem(id, organizationId, {
      productOptionId: body.productOptionId,
    });
  }

  @Post('items/:id/ignore')
  async ignoreItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CoupangReconciliationIgnoreDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.ignoreItem(id, organizationId, {
      reason: body.reason ?? null,
    });
  }
}
