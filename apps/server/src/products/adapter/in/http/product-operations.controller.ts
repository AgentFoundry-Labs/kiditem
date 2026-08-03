import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { ProductOperationsService } from '../../../application/service/product-operations.service';
import { ProductRecipeComponentCandidateService } from '../../../application/service/product-recipe-component-candidate.service';
import {
  ProductOperationsDataStatusQueryDto,
  ProductOperationsListQueryDto,
  ProductRecipeComponentCandidateQueryDto,
} from './dto/product-operations.dto';
import type { AuthUser } from '../../../../auth/auth.types';
import { ProductOperationsDataStatusService } from '../../../application/service/product-operations-data-status.service';

@Controller('products')
export class ProductOperationsController {
  constructor(
    private readonly products: ProductOperationsService,
    private readonly recipeCandidates: ProductRecipeComponentCandidateService,
    private readonly dataStatus: ProductOperationsDataStatusService,
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

  @Get('recipe-component-candidates')
  listRecipeComponentCandidates(
    @CurrentOrganization() organizationId: string,
    @Query() query: ProductRecipeComponentCandidateQueryDto,
  ) {
    return this.recipeCandidates.search(organizationId, query);
  }

  @Post('masters')
  createProduct(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    return this.products.createProduct(organizationId, user.id, body);
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
    return this.products.updateProduct(organizationId, masterProductId, body);
  }

  @Put('channel-options/:channelListingOptionId/inventory-components')
  replaceChannelOptionInventory(
    @CurrentOrganization() organizationId: string,
    @Param('channelListingOptionId', new ParseUUIDPipe()) channelListingOptionId: string,
    @Body() body: unknown,
  ) {
    return this.products.replaceChannelOptionInventory(
      organizationId,
      channelListingOptionId,
      body,
    );
  }
}
