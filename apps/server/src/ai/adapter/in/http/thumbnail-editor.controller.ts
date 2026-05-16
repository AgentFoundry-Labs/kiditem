import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { ThumbnailEditorDto } from './dto/thumbnail-editor.dto';
import { ReconcileThumbnailBodyDto } from './dto/thumbnail-reconcile.dto';
import { ThumbnailEditorAiService } from '../../../application/service/thumbnail-editor-ai.service';
import { ThumbnailAgentReconcileService } from '../../../application/service/thumbnail-agent-reconcile.service';
import type {
  ThumbnailEditorEditCase,
  ThumbnailEditorInputImage,
  ThumbnailInputRole,
} from '../../../domain/model/thumbnail-editor';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';

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
    private readonly reconcile: ThumbnailAgentReconcileService,
  ) {}

  /**
   * `/api/thumbnail-editor/generate` — two paths:
   *
   * - **Product-bound (`productId` set, default for the editor UI)**:
   *   creates a `pending` `ThumbnailGeneration` row, opens an
   *   `(operationKey='thumbnail-edit:<id>', sourceType='thumbnail_generation')`
   *   operation alert, and enqueues a `thumbnail_generate` Agent OS
   *   request. Returns `{ generationId, status: 'pending' }` immediately.
   *   Frontend polls the generation row to surface candidates when the
   *   bridge + sink finalize.
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
    if (body.productId && body.sourceCandidateId) {
      throw new BadRequestException('productId 와 sourceCandidateId 는 동시에 사용할 수 없습니다');
    }
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
    const productName = product?.name ?? body.productName ?? null;
    const category = product?.category ?? null;

    if (product) {
      // Async path — Agent OS owns the LLM call from here. Producer side
      // creates the row + alert + enqueue and returns immediately.
      const enqueueResult = await this.generationService.enqueueEditorGeneration({
        organizationId,
        productId: product.id,
        productName: product.name,
        triggeredByUserId: authUser?.id ?? null,
        inputs,
        inputMeta: this.inputMeta(body, mode, editCase, inputs),
        method: mode === 'creative' ? 'creative' : 'generate',
        originalUrl: product.imageUrl ?? inputs[0]?.url ?? '',
        registrationWorkspaceId: body.registrationWorkspaceId ?? null,
        agentPayload: this.agentPayload({
          body,
          mode,
          editCase,
          composition,
          inputs,
          productName,
          category,
        }),
      });
      return {
        candidates: [],
        generationId: enqueueResult.generationId,
        status: 'pending',
      } satisfies EnqueueResponse;
    }

    if (body.sourceCandidateId) {
      const enqueueResult = await this.generationService.enqueueCandidateGeneration({
        organizationId,
        sourceCandidateId: body.sourceCandidateId,
        productName,
        triggeredByUserId: authUser?.id ?? null,
        inputs,
        inputMeta: this.inputMeta(body, mode, editCase, inputs),
        method: mode === 'creative' ? 'creative' : 'generate',
        originalUrl: inputs[0]?.url ?? '',
        registrationWorkspaceId: body.registrationWorkspaceId ?? null,
        agentPayload: {
          ...this.agentPayload({
            body,
            mode,
            editCase,
            composition,
            inputs,
            productName,
            category,
          }),
          sourceCandidateId: body.sourceCandidateId,
        },
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
      inputMeta: this.inputMeta(body, mode, editCase, inputs),
      method: mode === 'creative' ? 'creative' : 'generate',
      originalUrl: inputs[0]?.url ?? '',
      registrationWorkspaceId: body.registrationWorkspaceId ?? null,
      agentPayload: {
        ...this.agentPayload({
          body,
          mode,
          editCase,
          composition,
          inputs,
          productName,
          category,
        }),
      },
    });
    return {
      candidates: [],
      generationId: enqueueResult.generationId,
      status: 'pending',
    } satisfies EnqueueResponse;
  }

  private agentPayload(input: {
    body: ThumbnailEditorDto;
    mode: 'edit' | 'creative';
    editCase: ThumbnailEditorEditCase;
    composition: string | undefined;
    inputs: ThumbnailEditorInputImage[];
    productName: string | null;
    category: string | null;
  }): Record<string, unknown> {
    const { body, mode, editCase, composition, inputs } = input;
    return {
      mode,
      editCase: mode === 'edit' ? editCase : undefined,
      purpose: body.purpose,
      productName: input.productName,
      productDescription: body.productDescription,
      category: input.category,
      sceneType: body.sceneType,
      styleType: body.styleType,
      supplementaryLabel: body.supplementaryLabel,
      pieceCount: body.pieceCount,
      colorCount: body.colorCount,
      layout: body.layout,
      composition,
      userPrompt: body.userPrompt,
      hasStyleReference: mode === 'creative' ? Boolean(body.backgroundReference) : undefined,
      inputs: inputs.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
        label: img.label,
        url: img.url,
        storageKey: img.storageKey,
        role: img.role,
        sortOrder: img.sortOrder,
        source: img.source,
        fileSize: img.fileSize,
      })),
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

  /**
   * Admin-triggered reconcile for the thumbnail editor Agent OS
   * pipeline. Replays terminal `AgentRunRequest` rows whose originating
   * `ThumbnailGeneration` is still `pending`/`running` — recovery path
   * for missed bus events. See agent-os/AGENTS.md "Recovery contract".
   *
   * Idempotent (`lockGenerationForProcessing` returns null on terminal
   * rows so the sink no-ops), so this can be invoked freely. Restricted
   * to owner/admin to avoid accidental load amplification.
   */
  @Post('reconcile-stuck')
  @Roles('owner', 'admin')
  reconcileStuck(
    @Body() body: ReconcileThumbnailBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.reconcile.reconcile(organizationId, {
      sinceMinutes: body.sinceMinutes,
      stalePendingMinutes: body.stalePendingMinutes,
      limit: body.limit,
    });
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
