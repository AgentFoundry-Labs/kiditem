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
  PRODUCT_SOURCE_SNAPSHOT_PORT,
  type ProductSourceSnapshotPort,
} from '../../../application/port/in/product-source-snapshot.port';
import {
  PRODUCT_EXPORT_PORT,
  type ProductExportPort,
} from '../../../application/port/in/product-export.port';
import {
  ListProductSourcesQueryDto,
} from './dto/list-product-sources-query.dto';
import { ListProductSourceImportRunsQueryDto } from './dto/list-product-source-import-runs-query.dto';

@Controller('inventory')
export class ProductSourceSnapshotController {
  constructor(
    @Inject(PRODUCT_SOURCE_SNAPSHOT_PORT)
    private readonly snapshots: ProductSourceSnapshotPort,
    @Inject(PRODUCT_EXPORT_PORT)
    private readonly exporter: ProductExportPort,
  ) {}

  @Get('sellpia-skus/export')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async exportSnapshot(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListProductSourcesQueryDto,
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
    @Query() query: ListProductSourcesQueryDto,
  ) {
    return this.snapshots.listSnapshotForExport(organizationId, query);
  }

  @Get('sellpia-skus')
  listSnapshot(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListProductSourcesQueryDto,
  ) {
    return this.snapshots.listSnapshot(organizationId, query);
  }

  @Get('sellpia-skus/:masterProductId')
  getSnapshot(
    @CurrentOrganization() organizationId: string,
    @Param('masterProductId', new ParseUUIDPipe()) masterProductId: string,
  ) {
    return this.snapshots.getSnapshot(organizationId, masterProductId);
  }

  @Get('sellpia-sync/import-runs')
  listImportRuns(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListProductSourceImportRunsQueryDto,
  ) {
    return this.snapshots.listImportRuns(organizationId, query);
  }
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
