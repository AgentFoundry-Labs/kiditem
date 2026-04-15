import { Controller, Post, Body, BadRequestException, Logger } from '@nestjs/common';
import { ThumbnailAiService } from '../services/thumbnail-ai.service';
import { ThumbnailGenerationService } from '../services/thumbnail-generation.service';
import { ThumbnailEditorDto } from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('thumbnail-editor')
export class ThumbnailEditorController {
  private readonly logger = new Logger(ThumbnailEditorController.name);

  constructor(
    private readonly thumbnailAiService: ThumbnailAiService,
    private readonly generationService: ThumbnailGenerationService,
  ) {}

  @Post('generate')
  async generate(@Body() body: ThumbnailEditorDto, @CurrentCompany() companyId: string) {
    const mode = body.mode ?? 'edit';
    const images: Array<{ data: string; mimeType: string; label: string }> = [];
    let product: { id: string; imageUrl: string | null; companyId: string } | null = null;

    if (body.productId) {
      product = await this.generationService.findProductForEditor(body.productId);
    }

    if (mode === 'creative') {
      // ── Type 3: Creative AI Background ──
      if (!body.productImage) {
        throw new BadRequestException('Creative 모드에는 상품 사진이 필요합니다');
      }

      const productData = await this.resolveImage(body.productImage);
      if (productData) images.push({ ...productData, label: 'Product photo' });

      if (body.backgroundReference) {
        const refData = await this.resolveImage(body.backgroundReference);
        if (refData) images.push({ ...refData, label: 'Style reference' });
      }

      if (images.length === 0) {
        throw new BadRequestException('상품 사진이 필요합니다');
      }

      const sceneType = body.sceneType ?? 'white-studio';
      const styleType = body.styleType ?? 'minimal';

      const results = await this.thumbnailAiService.generateCreative(
        images,
        sceneType,
        styleType,
        body.productDescription,
        body.userPrompt,
      );

      let generationId: string | null = null;
      if (product) {
        generationId = await this.generationService.saveEditorResult({
          productId: product.id,
          companyId,
          originalUrl: product.imageUrl,
          candidates: results,
          method: 'creative',
        });
      }

      return { candidates: results, generationId };
    }

    // ── Type 2: Compose (edit mode) ──
    if (body.colorImages && body.colorImages.length > 0) {
      // Type 2B: 색상별 상품 사진 배치
      if (body.productImage) {
        const mainData = await this.resolveImage(body.productImage);
        if (mainData) images.push({ ...mainData, label: 'Main product' });
      }

      for (let i = 0; i < body.colorImages.length; i++) {
        const data = await this.resolveImage(body.colorImages[i]);
        if (data) images.push({ ...data, label: `Color variant ${i + 1}` });
      }
    } else {
      // Type 2A: 상품 + 박스/보조 (기존 경로)
      if (body.productImage) {
        const data = await this.resolveImage(body.productImage);
        if (data) images.push({ ...data, label: 'Product photo' });
      }

      if (body.packagingImage) {
        const data = await this.resolveImage(body.packagingImage);
        if (data) images.push({ ...data, label: body.supplementaryLabel ?? 'Product packaging' });
      }
    }

    if (images.length === 0) {
      throw new BadRequestException('상품 사진이 필요합니다');
    }

    const parts: string[] = [];
    if (body.pieceCount) parts.push(`${body.pieceCount}개입`);
    if (body.colorCount) parts.push(`${body.colorCount}가지 색상`);
    const composition = parts.length > 0 ? parts.join(', ') : undefined;

    const purpose = body.purpose === 'quality' ? 'quality' as const : 'compliance' as const;
    const results = await this.thumbnailAiService.generateFromInputs(images, composition, purpose, body.userPrompt);

    let generationId: string | null = null;
    if (product) {
      generationId = await this.generationService.saveEditorResult({
        productId: product.id,
        companyId,
        originalUrl: product.imageUrl,
        candidates: results,
        method: 'generate',
      });
    }

    return { candidates: results, generationId };
  }

  private async resolveImage(input: string): Promise<{ data: string; mimeType: string } | null> {
    const match = input.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], data: match[2] };

    if (input.startsWith('http')) {
      try {
        return await this.thumbnailAiService.fetchImageAsBase64Public(input);
      } catch (err) {
        this.logger.warn(`이미지 URL fetch 실패 (${input}): ${err instanceof Error ? err.message : err}`);
        return null;
      }
    }

    return null;
  }
}
