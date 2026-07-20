import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  BoldVerticalGenerationSchema,
  BOLD_VERTICAL_SYSTEM,
  buildBoldVerticalUser,
  type BoldVerticalGeneration,
} from '../../domain/prompts/bold-vertical/single-call';
import {
  DetailPageGenerationSchema,
  SINGLE_CALL_SYSTEM,
  buildSingleCallUser,
  type DetailPageGeneration,
} from '../../domain/prompts/detail-page/single-call';
import type {
  DetailPageGenerateDirectInput,
  DetailPageGenerateDirectOutput,
} from '../../domain/direct-generation';
import {
  TEXT_COMPLETION_PORT,
  type TextCompletionPort,
} from '../port/out/provider/text-completion.port';
import { DetailPageGeneratedImagesService } from './detail-page-generated-images.service';
import type { DetailPageRawInput } from './detail-page-ai.types';
import { DetailPageResultRefinerService } from './detail-page-result-refiner.service';

const GENERATED_IMAGE_TIMEOUT_MS = 15 * 60_000;

export interface DetailPageDirectGenerationModelPlan {
  image: string;
  vision: string;
}

@Injectable()
export class DetailPageDirectGenerationExecutorService {
  private readonly logger = new Logger(DetailPageDirectGenerationExecutorService.name);

  constructor(
    @Inject(TEXT_COMPLETION_PORT)
    private readonly textCompletion: TextCompletionPort,
    private readonly resultRefiner: DetailPageResultRefinerService,
    private readonly generatedImages: DetailPageGeneratedImagesService,
  ) {}

  async execute(input: {
    organizationId: string;
    generationInput: DetailPageGenerateDirectInput;
    textModel: string;
    modelPlan: DetailPageDirectGenerationModelPlan;
    signal?: AbortSignal;
  }): Promise<DetailPageGenerateDirectOutput> {
    input.signal?.throwIfAborted();
    if (!input.textModel.trim()) {
      throw new HttpException(
        'AI_TEXT_MODEL이 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
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
    } = input.generationInput;
    const isBoldVertical = templateId === 'bold-vertical';
    const rawInput: DetailPageRawInput = {
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
        throw new HttpException(
          'image-only detail generation requires an existing detail-page result.',
          HttpStatus.BAD_REQUEST,
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
      return this.attachProcessedImages({
        organizationId: input.organizationId,
        output,
        rawInput,
        generationMode,
        modelPlan: input.modelPlan,
        signal: input.signal,
      });
    }

    const kidsImageContext = isBoldVertical
      ? null
      : await this.resolveKidsImageContext({
          rawInput,
          reservedPackageImageIndices,
          safetyLabelImageIndices,
          visionModel: input.modelPlan.vision,
          signal: input.signal,
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
      model: input.textModel,
      signal: input.signal,
    });

    const schema = isBoldVertical
      ? BoldVerticalGenerationSchema
      : DetailPageGenerationSchema;
    const validated = schema.parse(this.extractJson(rawText));

    const refined = isBoldVertical
      ? await this.resultRefiner.refineBoldVerticalGeneration(
          validated as BoldVerticalGeneration,
          rawInput,
          { visionModel: input.modelPlan.vision, signal: input.signal },
        )
      : this.resultRefiner.applyKidsPlayfulImageSelectionRules(
          validated as DetailPageGeneration,
          rawInput,
          kidsImageContext ?? undefined,
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

    return this.attachProcessedImages({
      organizationId: input.organizationId,
      output,
      rawInput,
      generationMode,
      modelPlan: input.modelPlan,
      signal: input.signal,
    });
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
    modelPlan: DetailPageDirectGenerationModelPlan;
    signal?: AbortSignal;
  }): Promise<DetailPageGenerateDirectOutput> {
    if (input.generationMode === 'draft') {
      return { ...input.output, processedImages: {} };
    }
    const productName = pickProductName(
      input.output.result,
      input.output.templateId,
      input.rawInput.rawTitle,
    );
    try {
      const processedImages = await withAbortTimeout(
        (signal) => this.generatedImages.generateBestEffort({
          organizationId: input.organizationId,
          parsed: input.output.result,
          templateId: input.output.templateId,
          rawInput: input.rawInput,
          productName,
          excludedImageIndices: collectExcludedImageIndices(input.output),
          modelPlan: input.modelPlan,
          signal,
        }),
        GENERATED_IMAGE_TIMEOUT_MS,
        'detail-page direct AI generated image timeout',
        input.signal,
      );
      return { ...input.output, processedImages };
    } catch (err) {
      if (input.signal?.aborted) throw err;
      this.logger.warn(
        `detail-page direct AI generated image work skipped: ${
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
    visionModel?: string;
    signal?: AbortSignal;
  }) {
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
      visionModel: input.visionModel,
      signal: input.signal,
    });
  }

  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body);
  }
}

async function withAbortTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
  upstream?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortFromUpstream = () => controller.abort(upstream?.reason);
  upstream?.addEventListener('abort', abortFromUpstream, { once: true });
  if (upstream?.aborted) abortFromUpstream();
  const timeout = setTimeout(
    () => controller.abort(new Error(`${message} after ${timeoutMs}ms`)),
    timeoutMs,
  );
  timeout.unref?.();
  try {
    controller.signal.throwIfAborted();
    const result = await run(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timeout);
    upstream?.removeEventListener('abort', abortFromUpstream);
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
