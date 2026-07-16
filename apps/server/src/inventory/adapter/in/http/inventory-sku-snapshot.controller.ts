import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  INVENTORY_SKU_SNAPSHOT_LIST_PORT,
  type InventorySkuSnapshotListPort,
} from '../../../application/port/in/stock/inventory-sku-snapshot-list.port';
import {
  ListInventorySkusQueryDto,
  ListSellpiaImportRunsQueryDto,
} from './dto';

@Controller('inventory')
export class InventorySkuSnapshotController {
  constructor(
    @Inject(INVENTORY_SKU_SNAPSHOT_LIST_PORT)
    private readonly snapshots: InventorySkuSnapshotListPort,
  ) {}

  @Get('sellpia-skus')
  listSnapshot(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListInventorySkusQueryDto,
  ) {
    return this.snapshots.listSnapshot(organizationId, query);
  }

  @Get('sellpia-skus/:sellpiaInventorySkuId')
  getSnapshot(
    @CurrentOrganization() organizationId: string,
    @Param('sellpiaInventorySkuId', new ParseUUIDPipe()) sellpiaInventorySkuId: string,
  ) {
    return this.snapshots.getSnapshot(organizationId, sellpiaInventorySkuId);
  }

  @Get('sellpia-sync/import-runs')
  listImportRuns(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListSellpiaImportRunsQueryDto,
  ) {
    return this.snapshots.listImportRuns(organizationId, query);
  }
}
