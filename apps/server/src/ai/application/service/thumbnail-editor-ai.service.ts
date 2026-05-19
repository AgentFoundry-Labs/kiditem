import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  COMPLIANCE_SUGGESTIONS_HEADER,
  CREATIVE_PROMPT,
  CREATIVE_STYLE_REFERENCE_HINT,
  EDIT_PROMPT,
  GENERATE_PROMPT,
  GENERATE_REFERENCE_HEADER,
  QUALITY_EDIT_PROMPT,
  USER_PROMPT_PREFIX,
  buildProductContextHeader,
} from '../../domain/prompts/thumbnail-prompts';
import {
  buildCreativeScenarioBlock,
  buildGenerateScenarioBlock,
  classifyCategory,
} from '../../domain/prompts/thumbnail-prompt-scenarios';
import { buildLayoutBlock } from '../../domain/prompts/thumbnail-layout-presets';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../port/out/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/image-storage.port';
import {
  THUMBNAIL_IMAGE_GENERATION_PORT,
  type ThumbnailImageGenerationPort,
} from '../port/out/thumbnail-image-generation.port';
import {
  THUMBNAIL_REFERENCE_IMAGES_PORT,
  type ThumbnailReferenceImagesPort,
} from '../port/out/thumbnail-reference-images.port';
import { MAX_FETCH_BYTES } from '../../domain/thumbnail-image-source';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorEditCase,
  ThumbnailEditorInputImage,
  ThumbnailInputRole,
} from '../../domain/model/thumbnail-editor';

type ThumbnailEditorPurpose = 'compliance' | 'quality';
type ThumbnailEditorMode = 'edit' | 'creative';
type ThumbnailEditorLayout = 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';

interface DecodedImage {
  buffer: Buffer;
  mimeType: string;
}

interface ResolveInputOptions {
  label: string;
  role: ThumbnailInputRole;
  sortOrder: number;
  source?: string;
}

interface GenerateEditOptions {
  model?: string;
  purpose: ThumbnailEditorPurpose;
  editCase: ThumbnailEditorEditCase;
  composition?: string;
  userPrompt?: string;
  layout?: ThumbnailEditorLayout;
  productDescription?: string;
  productName?: string | null;
  category?: string | null;
  promptOverride?: string | null;
  /**
   * Legacy parity:
   * - editor/generate path (`generateFromInputs`) always included generation references.
   * - async edit-image path included references only for compliance edits.
   */
  referenceMode?: 'generate' | 'edit-image';
  /**
   * Per-violation edit instructions extracted from
   * `ComplianceScores.editSuggestions`. When present and non-empty, prepended
   * to the prompt under `COMPLIANCE_SUGGESTIONS_HEADER` so AI fixes the
   * concrete observed issues before applying generic compliance rules.
   */
  editSuggestions?: Record<string, string> | null;
}

interface GenerateCreativeOptions {
  model?: string;
  sceneType?: string;
  styleType?: string;
  productDescription?: string;
  userPrompt?: string;
  productName?: string | null;
  category?: string | null;
  /**
   * When the caller supplies a background/style reference image, this flag
   * enables a hint that tells the model to treat it as a stylistic guide
   * rather than a product to reproduce.
   */
  hasStyleReference?: boolean;
}

@Injectable()
export class ThumbnailEditorAiService {
  private readonly logger = new Logger(ThumbnailEditorAiService.name);

  constructor(
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
    @Inject(THUMBNAIL_REFERENCE_IMAGES_PORT)
    private readonly references: ThumbnailReferenceImagesPort,
    @Inject(THUMBNAIL_IMAGE_GENERATION_PORT)
    private readonly imageGeneration: ThumbnailImageGenerationPort,
  ) {}

  async resolveInputImage(
    input: string,
    organizationId: string,
    options: ResolveInputOptions,
  ): Promise<ThumbnailEditorInputImage> {
    const dataUrl = this.parseDataUrl(input);
    if (dataUrl) {
      const url = await this.storage.save(
        this.inputStorageKey(organizationId, dataUrl.mimeType),
        dataUrl.buffer,
        dataUrl.mimeType,
      );
      return {
        data: dataUrl.buffer.toString('base64'),
        mimeType: dataUrl.mimeType,
        label: options.label,
        url,
        storageKey: this.storage.extractKey(url),
        role: options.role,
        sortOrder: options.sortOrder,
        source: options.source ?? 'upload',
        fileSize: dataUrl.buffer.length,
      };
    }

    const ownKey = this.storage.extractKey(input);
    const fetched = ownKey
      ? await this.imageFetcher.fetchTrustedStorageImage(input)
      : await this.imageFetcher.fetchImage(input);
    if (ownKey) {
      return {
        data: fetched.buffer.toString('base64'),
        mimeType: fetched.mimeType,
        label: options.label,
        url: input,
        storageKey: ownKey,
        role: options.role,
        sortOrder: options.sortOrder,
        source: options.source ?? 'hub',
        fileSize: fetched.buffer.length,
      };
    }

    const url = await this.storage.save(
      this.inputStorageKey(organizationId, fetched.mimeType),
      fetched.buffer,
      fetched.mimeType,
    );
    return {
      data: fetched.buffer.toString('base64'),
      mimeType: fetched.mimeType,
      label: options.label,
      url,
      storageKey: this.storage.extractKey(url),
      role: options.role,
      sortOrder: options.sortOrder,
      source: options.source ?? 'external',
      fileSize: fetched.buffer.length,
    };
  }

  async generateEdit(
    inputs: ThumbnailEditorInputImage[],
    organizationId: string,
    options: GenerateEditOptions,
  ): Promise<ThumbnailEditorCandidate[]> {
    const includeReferences = options.referenceMode === 'edit-image'
      ? options.purpose === 'compliance'
      : true;
    return this.generateAndStore(
      inputs,
      organizationId,
      this.buildEditPrompt(inputs, options),
      'edit',
      includeReferences,
      options.model,
    );
  }

  async generateCreative(
    inputs: ThumbnailEditorInputImage[],
    organizationId: string,
    options: GenerateCreativeOptions,
  ): Promise<ThumbnailEditorCandidate[]> {
    return this.generateAndStore(
      inputs,
      organizationId,
      this.buildCreativePrompt(inputs, options),
      'creative',
      false,
      options.model,
    );
  }

  private async generateAndStore(
    inputs: ThumbnailEditorInputImage[],
    organizationId: string,
    prompt: string,
    method: ThumbnailEditorMode,
    includeReferences: boolean,
    model: string | undefined,
  ): Promise<ThumbnailEditorCandidate[]> {
    if (inputs.length === 0) throw new BadRequestException('상품 사진이 필요합니다');

    // The asset directory may be missing; in that case `referenceParts` is an
    // empty array and the request is unchanged. Creative mode intentionally
    // skips these references to preserve the auth-integrated free-background
    // behavior.
    const referenceParts = includeReferences
      ? this.references.generationParts(GENERATE_REFERENCE_HEADER)
      : [];

    const parts = await this.imageGeneration.generateImageParts({
      model,
      parts: [
        ...referenceParts,
        ...inputs.flatMap((img) => [
          { text: `[${img.label}]` },
          { inlineData: { data: img.data, mimeType: img.mimeType } },
        ]),
        { text: prompt },
      ],
    });
    const candidates: ThumbnailEditorCandidate[] = [];
    for (const part of parts) {
      if (!('inlineData' in part)) continue;
      const inlineData = part.inlineData;
      if (!inlineData?.data) continue;
      const mimeType = inlineData.mimeType ?? 'image/png';
      const buffer = Buffer.from(inlineData.data, 'base64');
      this.imageFetcher.assertSupportedMime(mimeType);
      const key = this.candidateStorageKey(organizationId, mimeType);
      const url = await this.storage.save(key, buffer, mimeType);
      candidates.push({
        url,
        storageKey: key,
        filename: `${method}-${candidates.length + 1}.${this.imageFetcher.extForMime(mimeType)}`,
        mimeType,
        fileSize: buffer.length,
      });
    }

    if (candidates.length === 0) {
      const text = parts.find((part): part is { text: string } => 'text' in part)
        ?.text
        .slice(0, 300);
      this.logger.warn(`Gemini image response had no inline image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('thumbnail_ai_returned_no_image');
    }
    return candidates;
  }

  private buildEditPrompt(inputs: ThumbnailEditorInputImage[], options: GenerateEditOptions): string {
    const basePrompt = options.promptOverride?.trim()
      ? options.promptOverride
      : this.shouldUseGeneratePrompt(options)
        ? this.buildGeneratePrompt(options)
        : options.purpose === 'quality'
          ? QUALITY_EDIT_PROMPT
          : EDIT_PROMPT;

    // Surface per-violation suggestions ahead of the generic prompt so AI fixes
    // the concrete observed issues first. Compliance-only — quality path
    // doesn't carry violation suggestions.
    let prompt = basePrompt;
    if (
      options.purpose === 'compliance' &&
      options.editSuggestions &&
      Object.keys(options.editSuggestions).length > 0
    ) {
      const lines = Object.entries(options.editSuggestions)
        .filter(([, instruction]) => typeof instruction === 'string' && instruction.trim())
        .map(([key, instruction]) => `- [${key}] ${instruction}`)
        .join('\n');
      if (lines) {
        prompt = `${COMPLIANCE_SUGGESTIONS_HEADER}\n${lines}\n\n${basePrompt}`;
      }
    }

    return [
      buildProductContextHeader(options.productName, options.category).trimEnd(),
      this.inputLabelsBlock(inputs),
      prompt,
      options.productDescription ? `Product description: ${options.productDescription}` : '',
      options.userPrompt ? `${USER_PROMPT_PREFIX}\n${options.userPrompt}` : '',
    ].filter(Boolean).join('\n\n');
  }

  private buildCreativePrompt(
    inputs: ThumbnailEditorInputImage[],
    options: GenerateCreativeOptions,
  ): string {
    const bucket = classifyCategory(options.category ?? options.productDescription ?? null);
    const prompt = CREATIVE_PROMPT
      .replace(
        '{productDescriptionLine}',
        options.productDescription ? `\n\nProduct description: ${options.productDescription}` : '',
      )
      .replace('{sceneType}', options.sceneType ?? 'white-studio')
      .replace('{styleType}', options.styleType ?? 'minimal')
      .replace('{scenarioBlock}', buildCreativeScenarioBlock(bucket));

    return [
      buildProductContextHeader(options.productName, options.category).trimEnd(),
      this.inputLabelsBlock(inputs),
      prompt,
      options.hasStyleReference ? CREATIVE_STYLE_REFERENCE_HINT : '',
      options.userPrompt ? `${USER_PROMPT_PREFIX}\n${options.userPrompt}` : '',
    ].filter(Boolean).join('\n');
  }

  private shouldUseGeneratePrompt(options: GenerateEditOptions): boolean {
    return (
      options.editCase !== 'single' ||
      Boolean(options.composition) ||
      Boolean(options.layout && options.layout !== 'auto')
    );
  }

  private buildGeneratePrompt(options: GenerateEditOptions): string {
    const bucket = classifyCategory(options.category ?? options.productDescription ?? null);
    return GENERATE_PROMPT
      .replace(
        '{compositionLine}',
        options.composition ? ` Product composition: "${options.composition}"` : '',
      )
      .replace('{scenarioBlock}', buildGenerateScenarioBlock(bucket, options.editCase))
      .replace('{layoutBlock}', buildLayoutBlock(options.layout ?? 'auto'));
  }

  private inputLabelsBlock(inputs: ThumbnailEditorInputImage[]): string {
    const labels = inputs.map((img, index) => `${index + 1}. ${img.label}`).join('\n');
    return labels ? `Input images:\n${labels}` : '';
  }

  private parseDataUrl(input: string): DecodedImage | null {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(input);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    this.imageFetcher.assertSupportedMime(mimeType);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_FETCH_BYTES) {
      throw new BadRequestException('image too large');
    }
    return { buffer, mimeType };
  }

  private inputStorageKey(organizationId: string, mimeType: string): string {
    return `thumbnail-inputs/${organizationId}/${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
  }

  private candidateStorageKey(organizationId: string, mimeType: string): string {
    return `thumbnail-generations/${organizationId}/${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
  }
}
