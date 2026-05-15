import {
  BadRequestException,
  Body, Controller, Get, Param, Patch, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterImageItemSchema, type MasterImageItem } from '@kiditem/shared/product';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import type { MulterFile } from '../../../../common/types';
import { MastersService } from '../../../application/service/masters.service';
import { UpdateMasterImagesDto } from '../../../dto/update-master-images.dto';

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

@Controller('products/masters')
export class MasterImagesController {
  constructor(private readonly svc: MastersService) {}

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
}
