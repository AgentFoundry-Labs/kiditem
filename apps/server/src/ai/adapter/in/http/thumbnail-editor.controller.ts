import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { ThumbnailEditorDto } from './dto/thumbnail-editor.dto';
import { ThumbnailEditorAiService } from '../../../application/service/thumbnail-editor-ai.service';
import type {
  ThumbnailEditorInputImage,
  ThumbnailInputRole,
} from '../../../domain/model/thumbnail-editor';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';
import {
  ThumbnailGenerationSubjectError,
  classifyThumbnailGenerationSubject,
} from '../../../domain/thumbnail-generation-subject';
import {
  buildThumbnailGenerateDirectInput,
  buildThumbnailGenerationInputMeta,
  inferThumbnailEditCase,
} from '../../../application/service/thumbnail-generation-requests';

interface EnqueueResponse {
  candidates: never[];
  generationId: string;
  status: 'pending';
}

@Controller('thumbnail-editor')
export class ThumbnailEditorController {
  constructor(
    private readonly editorAi: ThumbnailEditorAiService,
    private readonly generationService: ThumbnailGenerationService,
  ) {}

  /**
   * `/api/thumbnail-editor/generate` — two paths:
   *
   * - **Product-bound (`productId` set, default for the editor UI)**:
   *   creates a `pending` `ThumbnailGeneration` row, opens an
   *   `(operationKey='thumbnail-edit:<id>', sourceType='thumbnail_generation')`
   *   operation alert, and schedules direct thumbnail AI execution. Returns
   *   `{ generationId, status: 'pending' }` immediately.
   *   Frontend polls the generation row to surface candidates when the
   *   direct job sink finalizes.
   *
   * - **Standalone upload (`productId` + `sourceCandidateId` absent)**:
   *   creates only a `ThumbnailGeneration` row. It must not create sourcing
   *   inbox cards; direct upload thumbnail results are reachable by generation id.
   */
  @Post('generate')
  async generate(
    @Body() body: ThumbnailEditorDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() authUser?: AuthUser,
  ): Promise<EnqueueResponse> {
    const mode = body.mode ?? 'edit';
    let subject: ReturnType<typeof classifyThumbnailGenerationSubject>;
    try {
      subject = classifyThumbnailGenerationSubject(body);
    } catch (err) {
      if (err instanceof ThumbnailGenerationSubjectError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    const product = subject.productId
      ? await this.generationService.findProductForEditor(subject.productId, organizationId)
      : null;
    if (subject.productId && !product) {
      throw new BadRequestException('productId 에 해당하는 상품을 찾을 수 없습니다');
    }

    const inputs = await this.resolveInputs(body, organizationId);
    if (inputs.length === 0) {
      throw new BadRequestException('상품 사진이 필요합니다');
    }

    const editCase = inferThumbnailEditCase(body);
    const productName = product?.name ?? body.productName ?? null;
    const category = product?.category ?? null;
    const inputMeta = buildThumbnailGenerationInputMeta({
      mode,
      purpose: body.purpose,
      editCase,
      layout: body.layout ?? null,
      sceneType: body.sceneType ?? null,
      styleType: body.styleType ?? null,
      pieceCount: body.pieceCount ?? null,
      colorCount: body.colorCount ?? null,
      productName: body.productName ?? null,
      inputs,
    });
    const directPayload = buildThumbnailGenerateDirectInput({
      mode,
      editCase,
      purpose: body.purpose,
      productName,
      productDescription: body.productDescription,
      category,
      sceneType: body.sceneType,
      styleType: body.styleType,
      supplementaryLabel: body.supplementaryLabel,
      pieceCount: body.pieceCount,
      colorCount: body.colorCount,
      layout: body.layout,
      userPrompt: body.userPrompt,
      hasStyleReference: Boolean(body.backgroundReference),
      inputs,
    });

    if (product) {
      // Async path — producer side creates the row + alert + direct AI job and
      // returns immediately.
      const enqueueResult = await this.generationService.enqueueEditorGeneration({
        organizationId,
        productId: product.id,
        productName: product.name,
        triggeredByUserId: authUser?.id ?? null,
        inputs,
        inputMeta,
        method: mode === 'creative' ? 'creative' : 'generate',
        originalUrl: product.imageUrl ?? inputs[0]?.url ?? '',
        contentWorkspaceId: subject.contentWorkspaceId,
        directPayload,
      });
      return {
        candidates: [],
        generationId: enqueueResult.generationId,
        status: 'pending',
      } satisfies EnqueueResponse;
    }

    if (subject.sourceCandidateId) {
      const enqueueResult = await this.generationService.enqueueCandidateGeneration({
        organizationId,
        sourceCandidateId: subject.sourceCandidateId,
        productName,
        triggeredByUserId: authUser?.id ?? null,
        inputs,
        inputMeta,
        method: mode === 'creative' ? 'creative' : 'generate',
        originalUrl: inputs[0]?.url ?? '',
        contentWorkspaceId: subject.contentWorkspaceId,
        directPayload,
      });
      return {
        candidates: [],
        generationId: enqueueResult.generationId,
        status: 'pending',
      } satisfies EnqueueResponse;
    }

    const enqueueResult = await this.generationService.enqueueStandaloneGeneration({
      organizationId,
      productName,
      triggeredByUserId: authUser?.id ?? null,
      inputs,
      inputMeta,
      method: mode === 'creative' ? 'creative' : 'generate',
      originalUrl: inputs[0]?.url ?? '',
      contentWorkspaceId: subject.contentWorkspaceId,
      directPayload,
    });
    return {
      candidates: [],
      generationId: enqueueResult.generationId,
      status: 'pending',
    } satisfies EnqueueResponse;
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

}
