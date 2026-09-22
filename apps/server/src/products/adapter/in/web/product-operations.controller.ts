import { ProductErrorFilter } from './product-error.filter';
import { PRODUCT_SOURCE_BINDING_PORT, type ProductSourceBindingPort } from '../../../application/port/in/product-source-binding.port';
import {
  Body,
  Inject,
  UseFilters,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { PRODUCT_QUERY_PORT, type ProductQueryPort } from '../../../application/port/in/product-query.port';
import { PRODUCT_METADATA_PORT, type ProductMetadataPort } from '../../../application/port/in/product-metadata.port';
import {
  ProductOperationsDataStatusQueryDto,
  ProductOperationsListQueryDto,
} from './dto/product-operations.dto';
import { ProductDataStatusUseCase } from '../../../application/usecase/product-data-status.usecase';

@Controller('products')
@UseFilters(ProductErrorFilter)
export class ProductOperationsController {
  constructor(
    @Inject(PRODUCT_QUERY_PORT) private readonly products: ProductQueryPort,
    @Inject(PRODUCT_METADATA_PORT) private readonly metadata: ProductMetadataPort,
    @Inject(PRODUCT_SOURCE_BINDING_PORT) private readonly sourceCorrection: ProductSourceBindingPort,
    private readonly dataStatus: ProductDataStatusUseCase,
  ) {}

  @Get('masters')
  listProducts(
    @CurrentOrganization() organizationId: string,
    @Query() query: ProductOperationsListQueryDto,
  ) {
    return this.products.listProducts(organizationId, query);
  }

  @Get('masters/data-status')
  getDataStatus(
    @CurrentOrganization() organizationId: string,
    @Query() query: ProductOperationsDataStatusQueryDto,
  ) {
    return this.dataStatus.getStatus(organizationId, query.periodDays);
  }

  @Get('masters/:masterProductId')
  getProduct(
    @CurrentOrganization() organizationId: string,
    @Param('masterProductId', new ParseUUIDPipe()) masterProductId: string,
  ) {
    return this.products.getProduct(organizationId, masterProductId);
  }

  @Patch('masters/:masterProductId')
  updateProduct(
    @CurrentOrganization() organizationId: string,
    @Param('masterProductId', new ParseUUIDPipe()) masterProductId: string,
    @Body() body: unknown,
  ) {
    return this.metadata.updateProduct(organizationId, masterProductId, body);
  }

  @Patch('masters/:masterProductId/source-binding')
  correctSourceBinding(
    @CurrentOrganization() organizationId: string,
    @Param('masterProductId', new ParseUUIDPipe()) masterProductId: string,
    @Body() body: unknown,
  ) {
    return this.sourceCorrection.correctSourceBinding(organizationId, masterProductId, body);
  }
}
