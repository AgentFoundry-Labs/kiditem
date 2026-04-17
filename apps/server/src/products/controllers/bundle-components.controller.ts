// apps/server/src/products/controllers/bundle-components.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { BundleComponentSchema, type BundleComponent } from '@kiditem/shared';
import { toSerializable } from '../util/serialize';
import { BundleComponentsService } from '../services/bundle-components.service';
import { CreateBundleComponentDto } from '../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../dto/list-bundle-components.query';

// NOTE (auth/CLAUDE.md Hard bans): no `@UseGuards` / `@UsePipes` — rely on the
// global APP_GUARD (CompanyScopeGuard + RolesGuard) and the global
// ValidationPipe registered in main.ts / app.module.ts.
@Controller('products/bundle-components')
export class BundleComponentsController {
  constructor(private readonly svc: BundleComponentsService) {}

  @Post()
  async create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateBundleComponentDto,
  ): Promise<BundleComponent> {
    return BundleComponentSchema.parse(toSerializable(await this.svc.create(companyId, dto)));
  }

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListBundleComponentsQuery,
  ): Promise<BundleComponent[]> {
    const rows = await this.svc.list(companyId, q);
    return rows.map(r => BundleComponentSchema.parse(toSerializable(r)));
  }

  @Patch(':id')
  async update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBundleComponentDto,
  ): Promise<BundleComponent> {
    return BundleComponentSchema.parse(toSerializable(await this.svc.update(companyId, id, dto)));
  }

  @Delete(':id')
  async delete(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.delete(companyId, id);
    return { ok: true };
  }
}
