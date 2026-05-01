// apps/server/src/products/adapter/in/http/options.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { BundleComponentSchema, OptionWithComponentsSchema, ProductOptionSchema, type BundleComponent, type OptionWithComponents, type ProductOption } from '@kiditem/shared/product';
import { toSerializable } from '../../../util/serialize';
import { OptionsService } from '../../../application/service/options.service';
import { BundleComponentsService } from '../../../application/service/bundle-components.service';
import { CreateOptionDto } from '../../../dto/create-option.dto';
import { UpdateOptionDto } from '../../../dto/update-option.dto';
import { ListOptionsQuery } from '../../../dto/list-options.query';

// NOTE (auth/AGENTS.md Hard bans): no `@UseGuards` / `@UsePipes` here — rely on
// global APP_GUARD (OrganizationScopeGuard + RolesGuard) and global ValidationPipe
// registered in main.ts / app.module.ts.
//
// Controllers MUST NOT touch Prisma directly (apps/server/AGENTS.md —
// controller/service boundary). For bundle components we delegate to
// `BundleComponentsService.list` which already applies the organizationId scope.
@Controller('products/options')
export class OptionsController {
  constructor(
    private readonly svc: OptionsService,
    private readonly bundleComponentsSvc: BundleComponentsService,
  ) {}

  @Post()
  async create(
    @CurrentOrganization() organizationId: string,
    @Body() dto: CreateOptionDto,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.create(organizationId, dto)));
  }

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() q: ListOptionsQuery,
  ): Promise<{ items: ProductOption[]; nextCursor: string | null }> {
    const { items, nextCursor } = await this.svc.list(organizationId, q);
    return {
      items: items.map(r => ProductOptionSchema.parse(toSerializable(r))),
      nextCursor,
    };
  }

  @Get('by-sku/:sku')
  async findBySku(
    @CurrentOrganization() organizationId: string,
    @Param('sku') sku: string,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findBySku(organizationId, sku)));
  }

  @Get('by-barcode/:barcode')
  async findByBarcode(
    @CurrentOrganization() organizationId: string,
    @Param('barcode') barcode: string,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findByBarcode(organizationId, barcode)));
  }

  @Get(':id/components')
  async components(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ): Promise<BundleComponent[]> {
    // Ensure cross-tenant / soft-delete check before exposing components.
    await this.svc.findById(organizationId, id, {});
    const rows = await this.bundleComponentsSvc.list(organizationId, { bundleOptionId: id });
    return rows.map(r => BundleComponentSchema.parse(toSerializable(r)));
  }

  @Get(':id')
  async findById(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<OptionWithComponents> {
    const row = await this.svc.findById(organizationId, id, {
      includeDeleted: includeDeleted === 'true',
    });
    const components = await this.bundleComponentsSvc.list(organizationId, { bundleOptionId: id });
    return OptionWithComponentsSchema.parse(toSerializable({ ...row, components }));
  }

  @Patch(':id')
  async update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOptionDto,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.update(organizationId, id, dto)));
  }

  @Delete(':id')
  async softDelete(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.softDelete(organizationId, id);
    return { ok: true };
  }

  @Post(':id/restore')
  async restore(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.restore(organizationId, id);
    return { ok: true };
  }
}
