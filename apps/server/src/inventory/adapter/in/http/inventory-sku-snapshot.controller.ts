import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  INVENTORY_SKU_SNAPSHOT_LIST_PORT,
  type InventorySkuSnapshotExportReader,
  type InventorySkuSnapshotListPort,
} from '../../../application/port/in/stock/inventory-sku-snapshot-list.port';
import {
  INVENTORY_SKU_EXPORT_PORT,
  type InventorySkuExportPort,
} from '../../../application/port/in/stock/inventory-sku-export.port';
import {
  ListInventorySkusQueryDto,
  ListSellpiaImportRunsQueryDto,
} from './dto';

@Controller('inventory')
export class InventorySkuSnapshotController {
  constructor(
    @Inject(INVENTORY_SKU_SNAPSHOT_LIST_PORT)
    private readonly snapshots: InventorySkuSnapshotListPort
      & InventorySkuSnapshotExportReader,
    @Inject(INVENTORY_SKU_EXPORT_PORT)
    private readonly exporter: InventorySkuExportPort,
  ) {}

  @Get('sellpia-skus/export')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async exportSnapshot(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListInventorySkusQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.exporter.export(organizationId, query);
    response.setHeader(
      'Content-Disposition',
      contentDisposition(result.fileName),
    );
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('X-Inventory-Export-Rows', String(result.rowCount));
    return new StreamableFile(result.buffer);
  }

  @Get('sellpia-skus/export-snapshot')
  exportSnapshotRead(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListInventorySkusQueryDto,
  ) {
    return this.snapshots.listSnapshotForExport(organizationId, query);
  }

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

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
