import { Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ProductCatalogService } from '../../../application/service/product-catalog.service';
import { MastersService } from '../../../application/service/masters.service';
import { ProductManagementService } from '../../../application/service/product-management.service';
import { ListProductCatalogQuery } from '../../../dto/list-product-catalog.query';
import { ListMastersQuery } from '../../../dto/list-masters.query';

const DEPRECATION_HEADER = 'true';
const SUNSET_HEADER = 'Mon, 15 Jun 2026 00:00:00 GMT';

/**
 * @deprecated Use /api/products/catalog for reads, /api/products/masters for master writes,
 * /api/products/options for option writes. This controller exists only for
 * pre-existing cross-domain read callers during the product-contract migration.
 * Write methods (PATCH/PUT) are intentionally NOT registered in this slice; write-path
 * rewiring ships with the agent/workflow redesign (see plan §Deferred Work).
 */
@Controller('products')
export class ProductsLegacyController {
  constructor(
    private readonly catalog: ProductCatalogService,
    private readonly masters: MastersService,
    private readonly management: ProductManagementService,
  ) {}

  @Get()
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() q: ListProductCatalogQuery,
  ) {
    return this.catalog.list(organizationId, q);
  }

  @Get('pipeline-stats')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async pipelineStats(
    @CurrentOrganization() organizationId: string,
    @Query() q: ListMastersQuery,
  ) {
    return this.management.pipelineStats(organizationId, q);
  }

  // Both GET and POST supported for calculate-grades: action-board.service.ts
  // currently POSTs it, while any manual invocation tends to GET. Spec §3.4 lists
  // POST explicitly; we expose both to match real callers. No grade write occurs —
  // it returns current catalog counts as a read-only stub until the agent/workflow
  // redesign reimplements full grade recalculation.
  @Get('calculate-grades')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async calculateGradesGet(@CurrentOrganization() organizationId: string) {
    return this.calculateGradesImpl(organizationId);
  }

  @Post('calculate-grades')
  @HttpCode(200)
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async calculateGradesPost(@CurrentOrganization() organizationId: string) {
    return this.calculateGradesImpl(organizationId);
  }

  private async calculateGradesImpl(organizationId: string) {
    return {
      ok: true,
      counts: await this.catalog.counts(organizationId),
    };
  }

  @Get(':id/original-image-base64')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async originalImageBase64(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.masters.originalImageBase64(organizationId, id);
  }

  // NOTE: Detail-page content routes (`:id/preview`, `:id/history`,
  // `:id/edited-html`, `:id/history/:generationId`) are served by
  // ProductContentController (non-deprecated). Do not re-add them here.

  @Get(':id')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async detail(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.catalog.detail(organizationId, id);
  }
}
