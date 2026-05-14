import {
  Inject,
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
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
  DetailPageGenerateAgentInputSchema,
} from '../../../domain/agent-output';
import {
  BoldVerticalGenerationSchema,
  BOLD_VERTICAL_SYSTEM,
  buildBoldVerticalUser,
  type BoldVerticalGeneration,
} from '../../../domain/prompts/bold-vertical/single-call';
import {
  DetailPageGenerationSchema,
  SINGLE_CALL_SYSTEM,
  buildSingleCallUser,
  type DetailPageGeneration,
} from '../../../domain/prompts/detail-page/single-call';
import {
  TEXT_COMPLETION_PORT,
  type TextCompletionPort,
} from '../../../application/port/out/text-completion.port';
import { DetailPageResultRefinerService } from '../../../application/service/detail-page-result-refiner.service';

/**
 * `detail_page_generate` runtime handler.
 *
 * Owns the LLM execution side of the detail-page Agent OS pipeline:
 *
 *   1. Parse `ctx.input` against `DetailPageGenerateAgentInputSchema` (the
 *      contract the producer side enqueues).
 *   2. Build the templateId-specific Gemini prompt and call
 *      `TEXT_COMPLETION_PORT`.
 *   3. Validate the JSON response against the kids-playful or bold-vertical
 *      single-call schema.
 *   4. Apply the same `DetailPageResultRefinerService` rules the legacy sync
 *      path used (image-selection guarantees, package label fallback, etc).
 *   5. Return `AgentRuntimeResult.output` matching
 *      `DetailPageGenerateAgentOutputSchema` so the AI bridge + sink can
 *      apply it onto the originating `ContentGeneration` row.
 *
 * The handler does NOT touch Prisma. Persistence is the sink's job — see
 * `DetailPageContentGenerationSinkAdapter`. Image generation
 * (`DetailPageGeneratedImagesService.generateBestEffort`) is also deferred
 * to the sink because it depends on storage + the validated parse output.
 *
 * Registration — handlers must register themselves with
 * `AgentRuntimeHandlerRegistry` so the agent-os routing adapter can
 * resolve them. We do that in `onModuleInit()` because Nest guarantees
 * provider init order: AgentOsModule's registry is constructed before any
 * AiModule provider that imports it, so the registration is observable
 * by the time `AgentRunWorker` ticks.
 */
@Injectable()
export class DetailPageGenerateRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  private readonly logger = new Logger(DetailPageGenerateRuntimeHandler.name);

  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    @Inject(TEXT_COMPLETION_PORT)
    private readonly textCompletion: TextCompletionPort,
    private readonly resultRefiner: DetailPageResultRefinerService,
  ) {}

  onModuleInit(): void {
    this.registry.register(DETAIL_PAGE_GENERATE_AGENT_TYPE, this);
  }

  async execute(
    ctx: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    if (!ctx.model || ctx.model.length === 0) {
      // No silent model fallback — agent-os/AGENTS.md hard ban. The executor
      // should already have rejected this request with `model_required`, but
      // defend against future code paths that bypass that check.
      throw new AgentOsRuntimeError(
        'model_required',
        'detail_page_generate runtime requires an explicit model.',
      );
    }

    const parsedInput = DetailPageGenerateAgentInputSchema.safeParse(ctx.input);
    if (!parsedInput.success) {
      const issue = parsedInput.error.issues[0];
      throw new AgentOsRuntimeError(
        'agent_input_invalid',
        issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'detail_page_generate input failed schema validation.',
      );
    }

    const {
      templateId,
      generationMode,
      existingResult,
      raw,
      heroImageMode,
      reservedPackageImageIndices,
      safetyLabelImageIndices,
    } = parsedInput.data;
    const isBoldVertical = templateId === 'bold-vertical';

    const rawInput = {
      rawTitle: raw.rawTitle,
      rawCategory: raw.rawCategory ?? '',
      rawDescription: raw.rawDescription ?? '',
      rawOptions: raw.rawOptions ?? '',
      imageUrls: raw.imageUrls ?? [],
      heroImageMode,
      templateId,
      ageGroup: raw.ageGroup,
      detailImageCount: raw.detailImageCount,
      usageSectionMode: raw.usageSectionMode,
      kcCertificationStatus: raw.kcCertificationStatus,
      kcCertificationNumber: raw.kcCertificationNumber,
    };

    if (generationMode === 'image') {
      if (existingResult === undefined) {
        throw new AgentOsRuntimeError(
          'existing_detail_page_result_required',
          'image-only detail_page_generate requires an existing detail-page result.',
        );
      }
      const schema = isBoldVertical
        ? BoldVerticalGenerationSchema
        : DetailPageGenerationSchema;
      const validated = schema.parse(existingResult);
      const output = isBoldVertical
        ? {
            templateId: 'bold-vertical' as const,
            result: validated as BoldVerticalGeneration,
            imageUrls: rawInput.imageUrls,
          }
        : {
            templateId: 'kids-playful' as const,
            result: validated as DetailPageGeneration,
            imageUrls: rawInput.imageUrls,
            reservedPackageImageIndices: [],
            safetyLabelImageIndices: [],
          };
      return {
        output,
        provider: 'stored-detail-page',
      };
    }

    // Kids-playful prompt + image-selection rules need the package /
    // safety-label image hints. The producer side used to pre-compute
    // these via `DetailPageHeroImageService.inferPackageImagePositions`
    // (Gemini Vision) right before enqueue, which left a chunk of AI work
    // outside the Agent OS boundary. We do the inference HERE so the
    // entire generative call sequence — text + vision — runs inside the
    // runtime handler the executor accounts for. Producers MAY still pass
    // pre-computed indices on the input payload; if they do, we honour
    // them and skip the redundant Gemini call (eg. tests, reconcile
    // replays).
    const kidsImageContext = isBoldVertical
      ? null
      : await this.resolveKidsImageContext({
          rawInput,
          reservedPackageImageIndices,
          safetyLabelImageIndices,
        });

    const { text: rawText } = await this.textCompletion.complete({
      system: isBoldVertical ? BOLD_VERTICAL_SYSTEM : SINGLE_CALL_SYSTEM,
      user: isBoldVertical
        ? buildBoldVerticalUser({ raw: rawInput, heroImageMode })
        : buildSingleCallUser({
            raw: rawInput,
            heroImageMode,
            reservedPackageImageIndices: kidsImageContext
              ? [...kidsImageContext.packageImageIndices]
              : [],
            safetyLabelImageIndices: kidsImageContext
              ? [...kidsImageContext.safetyLabelImageIndices]
              : [],
          }),
      temperature: 0.8,
      responseMimeType: 'application/json',
      model: ctx.model,
    });

    const schema = isBoldVertical
      ? BoldVerticalGenerationSchema
      : DetailPageGenerationSchema;
    const validated = schema.parse(this.extractJson(rawText));

    const refined = isBoldVertical
      ? await this.resultRefiner.refineBoldVerticalGeneration(
          validated as BoldVerticalGeneration,
          rawInput,
        )
      : this.resultRefiner.applyKidsPlayfulImageSelectionRules(
          validated as DetailPageGeneration,
          rawInput,
          kidsImageContext ?? undefined,
        );

    this.logger.debug(
      `detail_page_generate run=${ctx.runId} templateId=${templateId} ` +
        `images=${rawInput.imageUrls.length}`,
    );

    const output = isBoldVertical
      ? {
          templateId: 'bold-vertical' as const,
          result: refined as BoldVerticalGeneration,
          imageUrls: rawInput.imageUrls,
        }
      : {
          templateId: 'kids-playful' as const,
          result: refined as DetailPageGeneration,
          imageUrls: rawInput.imageUrls,
          reservedPackageImageIndices: kidsImageContext
            ? [...kidsImageContext.packageImageIndices].sort((a, b) => a - b)
            : [],
          safetyLabelImageIndices: kidsImageContext
            ? [...kidsImageContext.safetyLabelImageIndices].sort((a, b) => a - b)
            : [],
        };

    return {
      output,
      provider: 'gemini-text',
    };
  }

  private async resolveKidsImageContext(input: {
    rawInput: {
      rawTitle: string;
      rawCategory: string;
      rawDescription: string;
      rawOptions: string;
      imageUrls: string[];
      heroImageMode: 'first' | 'llm-pick';
      templateId: 'kids-playful' | 'bold-vertical';
    };
    reservedPackageImageIndices: number[] | undefined;
    safetyLabelImageIndices: number[] | undefined;
  }) {
    // Producer-supplied indices win — both are present means a
    // reconcile/test path already paid the inference cost and is replaying
    // through the handler. Empty arrays count as "supplied" so callers can
    // explicitly opt out of vision inference.
    if (
      input.reservedPackageImageIndices !== undefined &&
      input.safetyLabelImageIndices !== undefined
    ) {
      return {
        packageImageIndices: new Set<number>(input.reservedPackageImageIndices),
        safetyLabelImageIndices: new Set<number>(input.safetyLabelImageIndices),
      };
    }
    return this.resultRefiner.prepareKidsPlayfulImageContext({
      templateId: input.rawInput.templateId,
      rawInput: input.rawInput,
    });
  }

  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body);
  }
}
