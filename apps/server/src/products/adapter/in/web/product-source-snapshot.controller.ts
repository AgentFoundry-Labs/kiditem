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
  type ProductSourceSnapshotSummary,
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
  async exportSnapshotRead(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListProductSourcesQueryDto,
  ) {
    return publishedSnapshot(
      await this.snapshots.listSnapshotForExport(organizationId, query),
    );
  }

  @Get('sellpia-skus')
  async listSnapshot(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListProductSourcesQueryDto,
  ) {
    return publishedSnapshot(await this.snapshots.listSnapshot(organizationId, query));
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

/**
 * 소유자 안의 이름(`*Products`)을 **공개 계약의 이름**(`*Skus`)으로 옮긴다.
 *
 * Products 는 안에서 마스터를 상품이라 부르지만(ADR-0017), 이 API 를 읽는 쪽의 계약은
 * `InventorySkuSnapshotSummarySchema` 다. 소유자 이름을 그대로 내보내면 화면이 Zod 에서
 * 깨지고 — 조용히 깨진다 — 쇼핑몰 현황의 셀피아 네 칸이 통째로 빈 줄('—')이 된다
 * (라이브 2026-09-22). 이름을 바꾸는 자리는 여기 경계 한 곳이다.
 */
function publishedSummary(summary: ProductSourceSnapshotSummary) {
  return {
    totalSkus: summary.totalProducts,
    linkedSkus: summary.linkedProducts,
    unlinkedSkus: summary.unlinkedProducts,
    inStockSkus: summary.inStockProducts,
    outOfStockSkus: summary.outOfStockProducts,
    totalUnits: summary.totalUnits,
    pricedAssetValue: summary.pricedAssetValue,
    unpricedSkuCount: summary.unpricedProductCount,
  };
}

function publishedSnapshot<T extends { summary: ProductSourceSnapshotSummary }>(result: T) {
  return { ...result, summary: publishedSummary(result.summary) };
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
