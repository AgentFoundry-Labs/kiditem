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
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { ProductOperationsService } from '../../../application/service/product-operations.service';
import { ProductVariantRecipeService } from '../../../application/service/product-variant-recipe.service';
import { ProductOperationsListQueryDto } from './dto/product-operations.dto';

@Controller('products')
export class ProductOperationsController {
  constructor(
    private readonly products: ProductOperationsService,
    private readonly recipes: ProductVariantRecipeService,
  ) {}

  @Get('masters')
  listProducts(
    @CurrentOrganization() organizationId: string,
    @Query() query: ProductOperationsListQueryDto,
  ) {
    return this.products.listProducts(organizationId, query);
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

  @Post('masters/:masterProductId/variants')
  createVariant(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('masterProductId', new ParseUUIDPipe()) masterProductId: string,
    @Body() body: unknown,
  ) {
    return this.products.createVariant(
      organizationId,
      user.id,
      masterProductId,
      body,
    );
  }

  @Patch('variants/:productVariantId')
  updateVariant(
    @CurrentOrganization() organizationId: string,
    @Param('productVariantId', new ParseUUIDPipe()) productVariantId: string,
    @Body() body: unknown,
  ) {
    return this.products.updateVariant(organizationId, productVariantId, body);
  }

  @Put('variants/:productVariantId/components')
  replaceRecipe(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('productVariantId', new ParseUUIDPipe()) productVariantId: string,
    @Body() body: unknown,
  ) {
    return this.recipes.replaceRecipe(
      organizationId,
      user.id,
      productVariantId,
      body,
    );
  }
}
