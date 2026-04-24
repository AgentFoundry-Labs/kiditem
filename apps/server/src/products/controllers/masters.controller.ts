// apps/server/src/products/controllers/masters.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  MasterImageItemSchema,
  MasterSchema, MasterWithOptionsSchema,
  type Master, type MasterImageItem, type MasterWithOptions,
} from '@kiditem/shared';
import type { MulterFile } from '../../common/types';
import { toSerializable } from '../util/serialize';
import { MastersService } from '../services/masters.service';
import { OptionsService } from '../services/options.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { UpdateMasterImagesDto } from '../dto/update-master-images.dto';
import { ListMastersQuery } from '../dto/list-masters.query';
import { ListOptionsQuery } from '../dto/list-options.query';

// Controllers MUST NOT touch Prisma directly (apps/server/CLAUDE.md:96-103 —
// controller/service boundary). For child options we delegate to
// `OptionsService.list` which applies companyId scope + soft-delete filter +
// the standard `createdAt desc` ordering used across the products domain.
@Controller('products/masters')
export class MastersController {
  constructor(
    private readonly svc: MastersService,
    private readonly optionsSvc: OptionsService,
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

  @Get(':id/images')
  async getImages(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ images: MasterImageItem[] }> {
    const images = await this.svc.getImages(companyId, id);
    return { images: images.map((img) => MasterImageItemSchema.parse(img)) };
  }

  @Patch(':id/images')
  async updateImages(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMasterImagesDto,
  ): Promise<{ images: MasterImageItem[] }> {
    const row = await this.svc.updateImages(companyId, id, dto.items);
    const images = ((row as unknown as { images: MasterImageItem[] | null }).images ?? []).map(
      (img) => MasterImageItemSchema.parse(img),
    );
    return { images };
  }

  @Post(':id/images/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
  ): Promise<{ image: MasterImageItem }> {
    const image = await this.svc.uploadImage(companyId, id, file);
    return { image: MasterImageItemSchema.parse(image) };
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
    const q = new ListOptionsQuery();
    q.masterId = id;
    const { items: options } = await this.optionsSvc.list(companyId, q);
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
