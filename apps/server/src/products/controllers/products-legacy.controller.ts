import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { ProductCatalogService } from '../services/product-catalog.service';
import { MastersService } from '../services/masters.service';
import { ListProductCatalogQuery } from '../dto/list-product-catalog.query';

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
  ) {}

  @Get()
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ) {
    return this.catalog.list(companyId, q);
  }

  @Get('pipeline-stats')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async pipelineStats(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ) {
    return this.catalog.counts(companyId, q);
  }

  @Get('calculate-grades')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async calculateGrades(
    @CurrentCompany() companyId: string,
  ) {
    return {
      ok: true,
      counts: await this.catalog.counts(companyId),
    };
  }

  @Get(':id/original-image-base64')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async originalImageBase64(
    @CurrentCompany() companyId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.masters.originalImageBase64(companyId, id);
  }

  @Get(':id')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async detail(
    @CurrentCompany() companyId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.catalog.detail(companyId, id);
  }
}
