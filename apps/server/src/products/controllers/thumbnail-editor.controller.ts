import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ThumbnailAiService } from '../services/thumbnail-ai.service';
import { ThumbnailGenerationService } from '../services/thumbnail-generation.service';
import { ThumbnailEditorDto } from '../dto';

@Controller('thumbnail-editor')
export class ThumbnailEditorController {
  constructor(
    private readonly thumbnailAiService: ThumbnailAiService,
    private readonly generationService: ThumbnailGenerationService,
  ) {}

  @Post('generate')
  async generate(@Body() body: ThumbnailEditorDto) {
    const images: Array<{ data: string; mimeType: string; label: string }> = [];
    let product: { id: string; imageUrl: string | null; companyId: string } | null = null;

    // productId가 있으면 product 조회 (DB 저장용)
    if (body.productId) {
      product = await this.generationService.findProductForEditor(body.productId);
    }

    // 상품 사진 (필수 — 클라이언트가 원본 자동 할당 또는 유저 업로드/허브 선택으로 채움)
    if (body.productImage) {
      const data = this.extractBase64(body.productImage);
      if (data) images.push({ ...data, label: 'Product photo' });
    }

    // 포장 사진 (옵션)
    if (body.packagingImage) {
      const data = this.extractBase64(body.packagingImage);
      if (data) images.push({ ...data, label: 'Product packaging photo' });
    }

    if (images.length === 0) {
      throw new BadRequestException('상품 사진이 필요합니다');
    }

    // 구성 정보 텍스트
    const parts: string[] = [];
    if (body.pieceCount) parts.push(`${body.pieceCount}개입`);
    if (body.colorCount) parts.push(`${body.colorCount}가지 색상`);
    const composition = parts.length > 0 ? parts.join(', ') : undefined;

    const purpose = body.purpose === 'quality' ? 'quality' as const : 'compliance' as const;
    const results = await this.thumbnailAiService.generateFromInputs(images, composition, purpose);

    // productId가 있으면 ThumbnailGeneration 레코드 저장
    let generationId: string | null = null;
    if (product) {
      generationId = await this.generationService.saveEditorResult({
        productId: product.id,
        companyId: product.companyId,
        originalUrl: product.imageUrl,
        candidates: results as object[],
      });
    }

    return { candidates: results, generationId };
  }

  private extractBase64(dataUrl: string): { data: string; mimeType: string } | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }
}
