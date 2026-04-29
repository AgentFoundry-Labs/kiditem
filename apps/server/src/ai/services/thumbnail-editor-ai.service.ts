import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import { StorageService } from '../../common/storage/storage.service';
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
} from './thumbnail-prompts';
import {
  buildCreativeScenarioBlock,
  buildGenerateScenarioBlock,
  classifyCategory,
} from './thumbnail-prompt-scenarios';
import { buildLayoutBlock } from './thumbnail-layout-presets';
import {
  ThumbnailImageFetcherService,
  MAX_FETCH_BYTES,
} from './thumbnail-image-fetcher.service';
import { ThumbnailReferenceImagesService } from './thumbnail-reference-images.service';
import { requireGeminiImageModel } from './thumbnail-gemini-config';

type ThumbnailEditorPurpose = 'compliance' | 'quality';
type ThumbnailEditorMode = 'edit' | 'creative';
export type ThumbnailEditorEditCase = 'single' | 'compose' | 'color-variants' | 'bundle';
type ThumbnailEditorLayout = 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';
export type ThumbnailInputRole = 'product' | 'box' | 'color_variant' | 'detail';

export interface ThumbnailEditorInputImage {
  data: string;
  mimeType: string;
  label: string;
  url: string;
  storageKey: string | null;
  role: ThumbnailInputRole;
  sortOrder: number;
  source: string;
  fileSize: number | null;
}

export interface ThumbnailEditorCandidate {
  url: string;
  filename: string | null;
  storageKey: string | null;
  mimeType: string | null;
  fileSize: number | null;
}

interface FetchedImage {
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
  private client: GoogleGenAI | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly imageFetcher: ThumbnailImageFetcherService,
    private readonly references: ThumbnailReferenceImagesService,
  ) {}

  async resolveInputImage(
    input: string,
    companyId: string,
    options: ResolveInputOptions,
  ): Promise<ThumbnailEditorInputImage> {
    const dataUrl = this.parseDataUrl(input);
    if (dataUrl) {
      const url = await this.storage.save(
        this.inputStorageKey(companyId, dataUrl.mimeType),
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
      this.inputStorageKey(companyId, fetched.mimeType),
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
    companyId: string,
    options: GenerateEditOptions,
  ): Promise<ThumbnailEditorCandidate[]> {
    const includeReferences = options.referenceMode === 'edit-image'
      ? options.purpose === 'compliance'
      : true;
    return this.generateAndStore(
      inputs,
      companyId,
      this.buildEditPrompt(inputs, options),
      'edit',
      includeReferences,
    );
  }

  async generateCreative(
    inputs: ThumbnailEditorInputImage[],
    companyId: string,
    options: GenerateCreativeOptions,
  ): Promise<ThumbnailEditorCandidate[]> {
    return this.generateAndStore(
      inputs,
      companyId,
      this.buildCreativePrompt(inputs, options),
      'creative',
      false,
    );
  }

  private async generateAndStore(
    inputs: ThumbnailEditorInputImage[],
    companyId: string,
    prompt: string,
    method: ThumbnailEditorMode,
    includeReferences: boolean,
  ): Promise<ThumbnailEditorCandidate[]> {
    if (inputs.length === 0) throw new BadRequestException('상품 사진이 필요합니다');

    // The asset directory may be missing; in that case `referenceParts` is an
    // empty array and the request is unchanged. Creative mode intentionally
    // skips these references to preserve the auth-integrated free-background
    // behavior.
    const referenceParts = includeReferences
      ? this.references.generationParts(GENERATE_REFERENCE_HEADER)
      : [];

    const response = await this.getClient().models.generateContent({
      model: requireGeminiImageModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...referenceParts,
            ...inputs.flatMap((img) => [
              { text: `[${img.label}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: prompt },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const candidates: ThumbnailEditorCandidate[] = [];
    for (const part of parts) {
      const inlineData = part.inlineData;
      if (!inlineData?.data) continue;
      const mimeType = inlineData.mimeType ?? 'image/png';
      const buffer = Buffer.from(inlineData.data, 'base64');
      this.imageFetcher.assertSupportedMime(mimeType);
      const key = this.candidateStorageKey(companyId, mimeType);
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
      const text = parts.find((part) => part.text)?.text?.slice(0, 300);
      this.logger.warn(`Gemini image response had no inline image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('thumbnail_ai_returned_no_image');
    }
    return candidates;
  }

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('thumbnail_ai_not_configured');
    if (!this.client) this.client = new GoogleGenAI({ apiKey });
    return this.client;
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

  private parseDataUrl(input: string): FetchedImage | null {
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

  private inputStorageKey(companyId: string, mimeType: string): string {
    return `thumbnail-inputs/${companyId}/${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
  }

  private candidateStorageKey(companyId: string, mimeType: string): string {
    return `thumbnail-generations/${companyId}/${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
  }
}
