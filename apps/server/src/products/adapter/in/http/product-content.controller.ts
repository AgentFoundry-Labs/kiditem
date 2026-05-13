import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { MastersService } from '../../../application/service/masters.service';

class SaveEditedHtmlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  html!: string;
}

/**
 * Detail-page content surface for MasterProduct-bound content.
 *
 * Routes here intentionally live at `/api/products/:id/...` (NOT
 * `/api/products/masters/...`) because the frontend already calls these paths.
 * They are NEW features (preview / edited-html / generation history) that
 * complement `MastersController` writes; `content/cards` powers the canonical
 * `/product-content` frontend route. These routes are not part of the
 * deprecated `ProductsLegacyController` cross-domain compat surface.
 *
 * Keep the route prefix `'products'` (no trailing segment) so that
 * `:id/preview`, `:id/history`, `:id/edited-html` resolve before the legacy
 * controller's `:id` catalog-detail route — Nest matches more specific paths
 * first so there is no conflict with the legacy `@Get(':id')`.
 */
@Controller('products')
export class ProductContentController {
  constructor(private readonly masters: MastersService) {}

  @Get('content/cards')
  async cards(
    @CurrentOrganization() organizationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('productId') productId?: string,
  ) {
    return this.masters.listContentCards(organizationId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      productId: productId || null,
    });
  }

  @Get(':id/preview')
  async preview(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.masters.getPreview(organizationId, id);
  }

  @Get(':id/history')
  async history(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.masters.getGenerationHistory(organizationId, id);
  }

  @Post(':id/edited-html')
  async saveEditedHtml(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SaveEditedHtmlDto,
  ) {
    return this.masters.saveEditedHtml(organizationId, id, body.html);
  }

  @Get(':id/edited-html')
  async getEditedHtml(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.masters.getEditedHtml(organizationId, id);
  }

  @Delete(':id/history/:generationId')
  async deleteHistory(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('generationId', new ParseUUIDPipe()) generationId: string,
  ) {
    return this.masters.deleteGenerationHistory(organizationId, id, generationId);
  }
}
