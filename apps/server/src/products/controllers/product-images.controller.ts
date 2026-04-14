import {
  Controller,
  Post,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { StorageService } from '../../common/storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveFromUrlDto } from '../dto';
import type { ProductImageItem } from '@kiditem/shared';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

@Controller('products')
export class ProductImagesController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 파일 업로드 → MinIO(또는 S3/R2) 저장 → URL 반환
   *
   * 저장 경로: product-images/{productId}/{uuid}.{ext}
   */
  @Post(':id/images/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          cb(new BadRequestException('JPEG, PNG, WebP만 허용됩니다'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadImage(
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
  ) {
    if (!file) throw new BadRequestException('파일이 필요합니다');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const ext = extname(file.originalname) || '.png';
    const key = `product-images/${productId}/${randomUUID()}${ext}`;
    const url = await this.storage.save(key, file.buffer, file.mimetype);
    return { url, key, size: file.size };
  }

  /**
   * 편집기 결과 등 기존 객체를 허브 저장소로 복사 + Product.images에 append
   *
   * 동작: generated-thumbnails/xxx → product-images/{productId}/yyy로 copy 후
   *       Product.images JSON에 새 URL append (원자적).
   */
  @Post(':id/images/save-from-url')
  async saveFromUrl(
    @Param('id') productId: string,
    @Body() body: SaveFromUrlDto,
    @CurrentCompany() companyId: string,
  ) {
    const sourceKey = this.storage.extractKey(body.url);
    if (!sourceKey) {
      throw new BadRequestException('스토리지 URL이 아닙니다');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const ext = extname(sourceKey) || '.png';
    const newKey = `product-images/${productId}/${randomUUID()}${ext}`;
    const newUrl = await this.storage.copy(sourceKey, newKey);

    const currentImages: ProductImageItem[] = Array.isArray(product.images)
      ? (product.images as unknown as ProductImageItem[])
      : [];

    if (currentImages.length >= 20) {
      throw new BadRequestException('이미지는 최대 20개까지 등록 가능합니다');
    }

    const nextImages: ProductImageItem[] = [
      ...currentImages,
      {
        url: newUrl,
        role: body.role,
        label: body.label,
        sortOrder: currentImages.length,
      },
    ];

    await this.prisma.product.update({
      where: { id: productId },
      data: { images: nextImages as unknown as Prisma.InputJsonValue },
    });

    return { url: newUrl, key: newKey };
  }
}
