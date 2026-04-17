// apps/server/src/products/controllers/masters.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  MasterSchema, MasterWithOptionsSchema,
  type Master, type MasterWithOptions,
} from '@kiditem/shared';
import { toSerializable } from '../util/serialize';
import { MastersService } from '../services/masters.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';

@Controller('products/masters')
export class MastersController {
  constructor(
    private readonly svc: MastersService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateMasterDto,
  ): Promise<Master> {
    const row = await this.svc.create(companyId, dto);
    return MasterSchema.parse(toSerializable(row));
  }

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListMastersQuery,
  ): Promise<{ items: Master[]; nextCursor: string | null }> {
    const { items, nextCursor } = await this.svc.list(companyId, q);
    return {
      items: items.map(r => MasterSchema.parse(toSerializable(r))),
      nextCursor,
    };
  }

  @Get('by-code/:code')
  async findByCode(
    @CurrentCompany() companyId: string,
    @Param('code') code: string,
  ): Promise<Master> {
    return MasterSchema.parse(toSerializable(await this.svc.findByCode(companyId, code)));
  }

  @Get('by-legacy/:legacyCode')
  async findByLegacy(
    @CurrentCompany() companyId: string,
    @Param('legacyCode') legacyCode: string,
  ): Promise<Master> {
    return MasterSchema.parse(toSerializable(await this.svc.findByLegacy(companyId, legacyCode)));
  }

  @Get(':id')
  async findById(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<MasterWithOptions> {
    const row = await this.svc.findById(companyId, id, {
      includeDeleted: includeDeleted === 'true',
    });
    const options = await this.prisma.productOption.findMany({
      where: { masterId: id, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
    return MasterWithOptionsSchema.parse(toSerializable({ ...row, options }));
  }

  @Patch(':id')
  async update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMasterDto,
  ): Promise<Master> {
    const row = await this.svc.update(companyId, id, dto);
    return MasterSchema.parse(toSerializable(row));
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
