// apps/server/src/products/adapter/in/http/masters.controller.ts
import {
  BadRequestException,
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

/**
 * Image upload guardrails (external review HIGH — defense in depth).
 *
 * `accept="..."` on the client is NOT a security boundary; an authenticated
 * caller can post arbitrary multipart bodies. Server enforces:
 *   1. byte cap so a single upload can't exhaust memory (Multer buffers).
 *   2. allow-listed MIME, rejected before the service touches storage.
 *
 * Magic-byte sniffing is a follow-up if these URLs become public/CDN-served.
 */
const MAX_IMAGE_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { MasterImageItemSchema, MasterSchema, MasterWithOptionsSchema, type Master, type MasterImageItem, type MasterWithOptions } from '@kiditem/shared/product';
import type { MulterFile } from '../../../../common/types';
import { toSerializable } from '../../../util/serialize';
import { MastersService } from '../../../application/service/masters.service';
import { OptionsService } from '../../../application/service/options.service';
import { CreateMasterDto } from '../../../dto/create-master.dto';
import { UpdateMasterDto } from '../../../dto/update-master.dto';
import { UpdateMasterImagesDto } from '../../../dto/update-master-images.dto';
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
  ): Promise<{ items: Master[]; nextCursor: string | null }> {
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

  @Get(':id/images')
  async getImages(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ): Promise<{ images: MasterImageItem[] }> {
    const images = await this.svc.getImages(organizationId, id);
    return { images: images.map((img) => MasterImageItemSchema.parse(img)) };
  }

  @Patch(':id/images')
  async updateImages(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMasterImagesDto,
  ): Promise<{ images: MasterImageItem[] }> {
    const row = await this.svc.updateImages(organizationId, id, dto.items);
    const images = ((row as unknown as { images: MasterImageItem[] | null }).images ?? []).map(
      (img) => MasterImageItemSchema.parse(img),
    );
    return { images };
  }

  @Post(':id/images')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_UPLOAD_SIZE_BYTES },
      fileFilter: (_req, f, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.has(f.mimetype)) {
          cb(new BadRequestException(`unsupported mime type: ${f.mimetype}`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
  ): Promise<{ image: MasterImageItem }> {
    return this.uploadImageResponse(organizationId, id, file);
  }

  private async uploadImageResponse(
    organizationId: string,
    id: string,
    file: MulterFile,
  ): Promise<{ image: MasterImageItem }> {
    const image = await this.svc.uploadImage(organizationId, id, file);
    return { image: MasterImageItemSchema.parse(image) };
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
