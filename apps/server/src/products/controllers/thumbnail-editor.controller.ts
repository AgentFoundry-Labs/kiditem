import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from '../services/thumbnail-ai.service';
import { ThumbnailEditorDto } from '../dto';

@Controller('thumbnail-editor')
export class ThumbnailEditorController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAiService: ThumbnailAiService,
  ) {}

  @Post('generate')
  async generate(@Body() body: ThumbnailEditorDto) {
    const images: Array<{ data: string; mimeType: string; label: string }> = [];

    // productId가 있으면 원본 이미지 로드
    if (body.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: body.productId },
      });
      if (product?.imageUrl) {
        const original = await this.thumbnailAiService.fetchImageAsBase64Public(product.imageUrl);
        images.push({ ...original, label: 'Original product image' });
      }
    }

    // 포장 사진
    if (body.packagingImage) {
      const data = this.extractBase64(body.packagingImage);
      if (data) images.push({ ...data, label: 'Product packaging photo' });
    }

    // 상품 사진
    if (body.productImage) {
      const data = this.extractBase64(body.productImage);
      if (data) images.push({ ...data, label: 'Product photo' });
    }

    if (images.length === 0) {
      throw new BadRequestException('최소 1개 이미지가 필요합니다 (productId 또는 이미지 업로드)');
    }

    // 구성 정보 텍스트
    const parts: string[] = [];
    if (body.pieceCount) parts.push(`${body.pieceCount}개입`);
    if (body.colorCount) parts.push(`${body.colorCount}가지 색상`);
    const composition = parts.length > 0 ? parts.join(', ') : undefined;

    const purpose = body.purpose === 'quality' ? 'quality' as const : 'compliance' as const;
    const results = await this.thumbnailAiService.generateFromInputs(images, composition, purpose);

    return { candidates: results };
  }

  private extractBase64(dataUrl: string): { data: string; mimeType: string } | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }
}
