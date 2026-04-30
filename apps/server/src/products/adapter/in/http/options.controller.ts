// apps/server/src/products/adapter/in/http/options.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { BundleComponentSchema, OptionWithComponentsSchema, ProductOptionSchema, type BundleComponent, type OptionWithComponents, type ProductOption } from '@kiditem/shared/product';
import { toSerializable } from '../../../util/serialize';
import { OptionsService } from '../../../application/service/options.service';
import { BundleComponentsService } from '../../../application/service/bundle-components.service';
import { CreateOptionDto } from '../../../dto/create-option.dto';
import { UpdateOptionDto } from '../../../dto/update-option.dto';
import { ListOptionsQuery } from '../../../dto/list-options.query';

// NOTE (auth/AGENTS.md Hard bans): no `@UseGuards` / `@UsePipes` here — rely on
// global APP_GUARD (CompanyScopeGuard + RolesGuard) and global ValidationPipe
// registered in main.ts / app.module.ts.
//
// Controllers MUST NOT touch Prisma directly (apps/server/AGENTS.md —
// controller/service boundary). For bundle components we delegate to
// `BundleComponentsService.list` which already applies the companyId scope.
@Controller('products/options')
export class OptionsController {
  constructor(
    private readonly svc: OptionsService,
    private readonly bundleComponentsSvc: BundleComponentsService,
  ) {}

  @Post()
  async create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateOptionDto,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.create(companyId, dto)));
  }

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListOptionsQuery,
  ): Promise<{ items: ProductOption[]; nextCursor: string | null }> {
    const { items, nextCursor } = await this.svc.list(companyId, q);
    return {
      items: items.map(r => ProductOptionSchema.parse(toSerializable(r))),
      nextCursor,
    };
  }

  @Get('by-sku/:sku')
  async findBySku(
    @CurrentCompany() companyId: string,
    @Param('sku') sku: string,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findBySku(companyId, sku)));
  }

  @Get('by-barcode/:barcode')
  async findByBarcode(
    @CurrentCompany() companyId: string,
    @Param('barcode') barcode: string,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findByBarcode(companyId, barcode)));
  }

  @Get(':id/components')
  async components(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<BundleComponent[]> {
    // Ensure cross-tenant / soft-delete check before exposing components.
    await this.svc.findById(companyId, id, {});
    const rows = await this.bundleComponentsSvc.list(companyId, { bundleOptionId: id });
    return rows.map(r => BundleComponentSchema.parse(toSerializable(r)));
  }

  @Get(':id')
  async findById(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<OptionWithComponents> {
    const row = await this.svc.findById(companyId, id, {
      includeDeleted: includeDeleted === 'true',
    });
    const components = await this.bundleComponentsSvc.list(companyId, { bundleOptionId: id });
    return OptionWithComponentsSchema.parse(toSerializable({ ...row, components }));
  }

  @Patch(':id')
  async update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOptionDto,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.update(companyId, id, dto)));
  }

  @Delete(':id')
  async softDelete(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.softDelete(companyId, id);
    return { ok: true };
  }

  @Post(':id/restore')
  async restore(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.restore(companyId, id);
    return { ok: true };
  }
}
