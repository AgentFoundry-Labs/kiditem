// apps/server/src/products/adapter/in/http/bundle-components.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { BundleComponentSchema, type BundleComponent } from '@kiditem/shared/product';
import { toSerializable } from '../../../util/serialize';
import { BundleComponentsService } from '../../../application/service/bundle-components.service';
import { CreateBundleComponentDto } from '../../../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../../../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../../../dto/list-bundle-components.query';

// NOTE (auth/AGENTS.md Hard bans): no `@UseGuards` / `@UsePipes` — rely on the
// global APP_GUARD (OrganizationScopeGuard + RolesGuard) and the global
// ValidationPipe registered in main.ts / app.module.ts.
@Controller('products/bundle-components')
export class BundleComponentsController {
  constructor(private readonly svc: BundleComponentsService) {}

  @Post()
  async create(
    @CurrentOrganization() organizationId: string,
    @Body() dto: CreateBundleComponentDto,
  ): Promise<BundleComponent> {
    return BundleComponentSchema.parse(toSerializable(await this.svc.create(organizationId, dto)));
  }

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() q: ListBundleComponentsQuery,
  ): Promise<BundleComponent[]> {
    const rows = await this.svc.list(organizationId, q);
    return rows.map(r => BundleComponentSchema.parse(toSerializable(r)));
  }

  @Patch(':id')
  async update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBundleComponentDto,
  ): Promise<BundleComponent> {
    return BundleComponentSchema.parse(toSerializable(await this.svc.update(organizationId, id, dto)));
  }

  @Delete(':id')
  async delete(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.delete(organizationId, id);
    return { ok: true };
  }
}
