// apps/server/src/products/adapter/in/http/masters.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { MasterSchema, MasterWithOptionsSchema, type Master, type MasterWithOptions } from '@kiditem/shared/product';
import { toSerializable } from '../../../util/serialize';
import { MastersService } from '../../../application/service/masters.service';
import { OptionsService } from '../../../application/service/options.service';
import { ProductManagementService, type ProductManagementListItem } from '../../../application/service/product-management.service';
import { CreateMasterDto } from '../../../dto/create-master.dto';
import { UpdateMasterDto } from '../../../dto/update-master.dto';
import { ListMastersQuery } from '../../../dto/list-masters.query';
import { ListOptionsQuery } from '../../../dto/list-options.query';

// Controllers MUST NOT touch Prisma directly (apps/server/AGENTS.md —
// controller/service boundary). For child options we delegate to
// `OptionsService.list` which applies organizationId scope + soft-delete filter +
// the standard `createdAt desc` ordering used across the products domain.
@Controller('products/masters')
export class MastersController {
  constructor(
    private readonly svc: MastersService,
    private readonly optionsSvc: OptionsService,
    private readonly managementSvc: ProductManagementService,
  ) {}

  @Post()
  async create(
    @CurrentOrganization() organizationId: string,
    @Body() dto: CreateMasterDto,
  ): Promise<Master> {
    const row = await this.svc.create(organizationId, dto);
    return MasterSchema.parse(toSerializable(row));
  }

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() q: ListMastersQuery,
  ): Promise<{
    items: Master[] | ProductManagementListItem[];
    total?: number;
    page?: number;
    limit?: number;
    nextCursor: string | null;
  }> {
    if (q.enriched) {
      return this.managementSvc.list(organizationId, q);
    }
    const { items, nextCursor } = await this.svc.list(organizationId, q);
    return {
      items: items.map(r => MasterSchema.parse(toSerializable(r))),
      nextCursor,
    };
  }

  @Get('by-code/:code')
  async findByCode(
    @CurrentOrganization() organizationId: string,
    @Param('code') code: string,
  ): Promise<Master> {
    return MasterSchema.parse(toSerializable(await this.svc.findByCode(organizationId, code)));
  }

  @Get('by-legacy/:legacyCode')
  async findByLegacy(
    @CurrentOrganization() organizationId: string,
    @Param('legacyCode') legacyCode: string,
  ): Promise<Master> {
    return MasterSchema.parse(toSerializable(await this.svc.findByLegacy(organizationId, legacyCode)));
  }

  @Get(':id')
  async findById(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<MasterWithOptions> {
    const row = await this.svc.findById(organizationId, id, {
      includeDeleted: includeDeleted === 'true',
    });
    const q = new ListOptionsQuery();
    q.masterId = id;
    const { items: options } = await this.optionsSvc.list(organizationId, q);
    return MasterWithOptionsSchema.parse(toSerializable({ ...row, options }));
  }

  @Patch(':id')
  async update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMasterDto,
  ): Promise<Master> {
    const row = await this.svc.update(organizationId, id, dto);
    return MasterSchema.parse(toSerializable(row));
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
