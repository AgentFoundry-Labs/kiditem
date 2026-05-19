import {
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import {
  THUMBNAIL_GENERATE_AGENT_TYPE,
  ThumbnailGenerateAgentInputSchema,
  type ThumbnailGenerateAgentInput,
  type ThumbnailGenerateAgentInputImage,
} from '../../../domain/agent-output';
import { ThumbnailEditorAiService } from '../../../application/service/thumbnail-editor-ai.service';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../../domain/model/thumbnail-editor';

/**
 * `thumbnail_generate` runtime handler.
 *
 * Owns the LLM execution side of the thumbnail editor Agent OS pipeline:
 *
 *   1. Parse `ctx.input` against `ThumbnailGenerateAgentInputSchema`.
 *   2. Reconstruct the `ThumbnailEditorInputImage[]` from the payload —
 *      the producer side already uploaded the originals via storage and
 *      embedded base64 `data` so the handler can call Gemini without
 *      re-fetching.
 *   3. Delegate to `ThumbnailEditorAiService.generateEdit /
 *      generateCreative` (existing service), which calls Gemini, uploads
 *      the candidate images, and returns
 *      `ThumbnailEditorCandidate[]`.
 *   4. Return `AgentRuntimeResult.output` matching
 *      `ThumbnailGenerateAgentOutputSchema` so the bridge + sink can
 *      apply the candidates onto the originating `ThumbnailGeneration`
 *      row.
 *
 * The handler does NOT touch Prisma. Persistence is the sink's job — see
 * `ThumbnailGenerationSinkAdapter`.
 *
 * Registration — handlers register themselves with
 * `AgentRuntimeHandlerRegistry` on `onModuleInit`. Nest guarantees
 * provider init order: AgentOsModule's registry is constructed before
 * AiModule providers (AiModule imports AgentOsModule), so the
 * registration is visible by the time the worker ticks.
 */
@Injectable()
export class ThumbnailGenerateRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  private readonly logger = new Logger(ThumbnailGenerateRuntimeHandler.name);

  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly editorAi: ThumbnailEditorAiService,
  ) {}

  onModuleInit(): void {
    this.registry.register(THUMBNAIL_GENERATE_AGENT_TYPE, this);
  }

  async execute(
    ctx: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    if (!ctx.model || ctx.model.length === 0) {
      throw new AgentOsRuntimeError(
        'model_required',
        'thumbnail_generate runtime requires an explicit model.',
      );
    }

    const parsed = ThumbnailGenerateAgentInputSchema.safeParse(ctx.input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AgentOsRuntimeError(
        'agent_input_invalid',
        issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'thumbnail_generate input failed schema validation.',
      );
    }

    const input = parsed.data;
    const inputs = input.inputs.map(toEditorInput);
    const candidates: ThumbnailEditorCandidate[] = await this.runMode(
      input,
      inputs,
      ctx.organizationId,
      ctx.model,
    );

    if (candidates.length === 0) {
      // ThumbnailEditorAiService throws ServiceUnavailableException when
      // Gemini returns no inline image, so reaching this branch means the
      // service silently returned empty — surface as a runtime error so
      // the executor finalizes the run as failed and the sink applies
      // FAILED to the row.
      throw new AgentOsRuntimeError(
        'thumbnail_ai_returned_no_image',
        'Gemini image generation returned no candidates.',
      );
    }

    this.logger.debug(
      `thumbnail_generate run=${ctx.runId} mode=${input.mode} editCase=${
        input.editCase ?? 'n/a'
      } candidates=${candidates.length}`,
    );

    return {
      output: {
        candidates: candidates.map((candidate) => ({
          url: candidate.url,
          filename: candidate.filename ?? null,
          storageKey: candidate.storageKey ?? null,
          mimeType: candidate.mimeType ?? null,
          fileSize: candidate.fileSize ?? null,
        })),
      },
      provider: 'gemini-image',
    };
  }

  private async runMode(
    input: ThumbnailGenerateAgentInput,
    inputs: ThumbnailEditorInputImage[],
    organizationId: string,
    model: string,
  ): Promise<ThumbnailEditorCandidate[]> {
    if (input.mode === 'creative') {
      return this.editorAi.generateCreative(inputs, organizationId, {
        model,
        sceneType: input.sceneType,
        styleType: input.styleType,
        productDescription: input.productDescription,
        userPrompt: input.userPrompt,
        productName: input.productName ?? null,
        category: input.category ?? null,
        hasStyleReference: input.hasStyleReference,
      });
    }
    return this.editorAi.generateEdit(inputs, organizationId, {
      model,
      purpose: input.purpose ?? 'compliance',
      editCase: input.editCase ?? 'single',
      composition: input.composition,
      userPrompt: input.userPrompt,
      layout: input.layout,
      productDescription: input.productDescription,
      productName: input.productName ?? null,
      category: input.category ?? null,
    });
  }
}

function toEditorInput(
  image: ThumbnailGenerateAgentInputImage,
): ThumbnailEditorInputImage {
  return {
    data: image.data,
    mimeType: image.mimeType,
    label: image.label,
    url: image.url,
    storageKey: image.storageKey,
    role: image.role,
    sortOrder: image.sortOrder,
    source: image.source,
    fileSize: image.fileSize,
  };
}
