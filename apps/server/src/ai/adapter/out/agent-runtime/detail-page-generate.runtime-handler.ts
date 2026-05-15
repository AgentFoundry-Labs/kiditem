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
import { DetailPageGeneratedImagesService } from '../../../application/service/detail-page-generated-images.service';
import type { DetailPageRawInput } from '../../../application/service/detail-page-ai.types';

const GENERATED_IMAGE_TIMEOUT_MS = 15 * 60_000;

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
 * `DetailPageContentGenerationSinkAdapter`. Generated image work also runs
 * here so AgentRun remains the durable record for the full AI/media execution,
 * while the sink stays a quick DB projection.
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
    private readonly generatedImages: DetailPageGeneratedImagesService,
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
        output: await this.attachProcessedImages({
          organizationId: ctx.organizationId,
          output,
          rawInput,
          generationMode,
        }),
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
      output: await this.attachProcessedImages({
        organizationId: ctx.organizationId,
        output,
        rawInput,
        generationMode,
      }),
      provider: 'gemini-text',
    };
  }

  private async attachProcessedImages(input: {
    organizationId: string;
    output:
      | {
          templateId: 'bold-vertical';
          result: BoldVerticalGeneration;
          imageUrls: string[];
        }
      | {
          templateId: 'kids-playful';
          result: DetailPageGeneration;
          imageUrls: string[];
          reservedPackageImageIndices: number[];
          safetyLabelImageIndices: number[];
        };
    rawInput: DetailPageRawInput;
    generationMode: 'draft' | 'image' | 'full';
  }) {
    if (input.generationMode === 'draft') {
      return { ...input.output, processedImages: {} };
    }
    const productName = pickProductName(
      input.output.result,
      input.output.templateId,
      input.rawInput.rawTitle,
    );
    try {
      const processedImages = await withTimeout(
        this.generatedImages.generateBestEffort({
          organizationId: input.organizationId,
          parsed: input.output.result,
          templateId: input.output.templateId,
          rawInput: input.rawInput,
          productName,
          excludedImageIndices: collectExcludedImageIndices(input.output),
        }),
        GENERATED_IMAGE_TIMEOUT_MS,
        'detail_page_generate generated image runtime timeout',
      );
      return { ...input.output, processedImages };
    } catch (err) {
      this.logger.warn(
        `detail_page_generate generated image work skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { ...input.output, processedImages: {} };
    }
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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${message} after ${timeoutMs}ms`)),
          timeoutMs,
        );
        if (typeof timeout === 'object' && typeof timeout.unref === 'function') {
          timeout.unref();
        }
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function pickProductName(
  parsed: unknown,
  templateId: 'kids-playful' | 'bold-vertical',
  fallback: string,
): string {
  if (templateId === 'bold-vertical') {
    const hookText = (parsed as { hook?: { text?: unknown } }).hook?.text;
    const hookTitleSub = (parsed as { hook?: { titleSub?: unknown } }).hook
      ?.titleSub;
    const title = [
      typeof hookText === 'string' ? hookText.trim() : '',
      typeof hookTitleSub === 'string' ? hookTitleSub.trim() : '',
    ]
      .filter(Boolean)
      .join(' ');
    return title || fallback.slice(0, 50);
  }
  const headline = (parsed as { section1?: { mainHeadline?: unknown } }).section1
    ?.mainHeadline;
  return typeof headline === 'string' && headline.trim()
    ? headline.trim()
    : fallback.slice(0, 50);
}

function collectExcludedImageIndices(input: {
  templateId: 'kids-playful' | 'bold-vertical';
  result: DetailPageGeneration | BoldVerticalGeneration;
  reservedPackageImageIndices?: number[];
  safetyLabelImageIndices?: number[];
}): number[] {
  const indices = new Set<number>();
  if (input.templateId === 'kids-playful') {
    for (const idx of input.reservedPackageImageIndices ?? []) {
      if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
    }
    for (const idx of input.safetyLabelImageIndices ?? []) {
      if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
    }
    return Array.from(indices).sort((a, b) => a - b);
  }
  const result = input.result as BoldVerticalGeneration;
  for (const idx of result.packageImageIndices ?? []) {
    if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
  }
  for (const idx of result.safetyLabelImageIndices ?? []) {
    if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
  }
  return Array.from(indices).sort((a, b) => a - b);
}
