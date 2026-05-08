import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { ThumbnailEditorDto } from './dto/thumbnail-editor.dto';
import { ThumbnailEditorAiService } from '../../../application/service/thumbnail-editor-ai.service';
import type {
  ThumbnailEditorEditCase,
  ThumbnailEditorInputImage,
  ThumbnailInputRole,
} from '../../../domain/model/thumbnail-editor';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';

@Controller('thumbnail-editor')
export class ThumbnailEditorController {
  constructor(
    private readonly editorAi: ThumbnailEditorAiService,
    private readonly generationService: ThumbnailGenerationService,
  ) {}

  @Post('generate')
  async generate(
    @Body() body: ThumbnailEditorDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    const mode = body.mode ?? 'edit';
    const product = body.productId
      ? await this.generationService.findProductForEditor(body.productId, organizationId)
      : null;
    if (body.productId && !product) {
      throw new BadRequestException('productId 에 해당하는 상품을 찾을 수 없습니다');
    }

    const inputs = await this.resolveInputs(body, organizationId);
    if (inputs.length === 0) {
      throw new BadRequestException('상품 사진이 필요합니다');
    }

    const editCase = this.inferEditCase(body);
    const composition = this.compositionText(body);
    const candidates = mode === 'creative'
      ? await this.editorAi.generateCreative(inputs, organizationId, {
          sceneType: body.sceneType,
          styleType: body.styleType,
          productDescription: body.productDescription,
          userPrompt: body.userPrompt,
          productName: product?.name ?? body.productName ?? null,
          category: product?.category ?? null,
          hasStyleReference: Boolean(body.backgroundReference),
        })
      : await this.editorAi.generateEdit(inputs, organizationId, {
          purpose: body.purpose,
          editCase,
          composition,
          userPrompt: body.userPrompt,
          layout: body.layout,
          productDescription: body.productDescription,
          productName: product?.name ?? body.productName ?? null,
          category: product?.category ?? null,
        });

    const generationId = product
      ? await this.generationService.saveEditorResult({
          productId: product.id,
          organizationId,
          originalUrl: product.imageUrl ?? inputs[0]?.url ?? null,
          candidates,
          inputImages: inputs,
          method: mode === 'creative' ? 'creative' : 'generate',
          inputMeta: this.inputMeta(body, mode, editCase, inputs),
          triggeredByUserId: authUser?.id ?? null,
        })
      : null;

    return {
      candidates: candidates.map((candidate) => ({
        url: candidate.url,
        filename: candidate.filename ?? candidate.storageKey?.split('/').pop() ?? 'thumbnail.png',
      })),
      generationId,
    };
  }

  private async resolveInputs(
    body: ThumbnailEditorDto,
    organizationId: string,
  ): Promise<ThumbnailEditorInputImage[]> {
    const inputs: ThumbnailEditorInputImage[] = [];
    const add = async (
      value: string | undefined,
      label: string,
      role: ThumbnailInputRole,
      source = 'upload',
    ) => {
      if (!value) return;
      inputs.push(
        await this.editorAi.resolveInputImage(value, organizationId, {
          label,
          role,
          sortOrder: inputs.length,
          source,
        }),
      );
    };

    if (body.mode === 'creative') {
      await add(body.productImage, 'Product photo', 'product');
      await add(body.backgroundReference, 'Style reference', 'detail');
      return inputs;
    }

    if (body.bundleImages?.length) {
      for (let i = 0; i < body.bundleImages.length; i++) {
        await add(
          body.bundleImages[i],
          body.bundleLabels?.[i] ?? `Bundle item ${i + 1}`,
          'product',
        );
      }
      return inputs;
    }

    if (body.colorImages?.length) {
      await add(body.productImage, 'Main product', 'product');
      for (let i = 0; i < body.colorImages.length; i++) {
        await add(body.colorImages[i], `Color variant ${i + 1}`, 'color_variant');
      }
      return inputs;
    }

    await add(body.productImage, 'Product photo', 'product');
    await add(body.packagingImage, body.supplementaryLabel ?? 'Product packaging', 'box');
    return inputs;
  }

  private inferEditCase(body: ThumbnailEditorDto): ThumbnailEditorEditCase {
    if (body.bundleImages?.length) return 'bundle';
    if (body.colorImages?.length) return 'color-variants';
    if (body.packagingImage) return 'compose';
    return 'single';
  }

  private compositionText(body: ThumbnailEditorDto): string | undefined {
    const parts: string[] = [];
    if (body.pieceCount) parts.push(`${body.pieceCount}개입`);
    if (body.colorCount) parts.push(`${body.colorCount}가지 색상`);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  private inputMeta(
    body: ThumbnailEditorDto,
    mode: 'edit' | 'creative',
    editCase: ThumbnailEditorEditCase,
    inputs: ThumbnailEditorInputImage[],
  ): Prisma.InputJsonValue {
    return {
      mode,
      purpose: body.purpose,
      editCase,
      layout: body.layout ?? null,
      sceneType: body.sceneType ?? null,
      styleType: body.styleType ?? null,
      pieceCount: body.pieceCount ?? null,
      colorCount: body.colorCount ?? null,
      inputCount: inputs.length,
      inputRoles: inputs.map((input) => input.role),
      inputLabels: inputs.map((input) => input.label),
    };
  }
}
