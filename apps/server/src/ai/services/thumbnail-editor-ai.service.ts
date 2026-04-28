import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import { StorageService } from '../../common/storage/storage.service';
import {
  CREATIVE_PROMPT,
  EDIT_PROMPT,
  GENERATE_PROMPT,
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

export type ThumbnailEditorPurpose = 'compliance' | 'quality';
export type ThumbnailEditorMode = 'edit' | 'creative';
export type ThumbnailEditorEditCase = 'single' | 'compose' | 'color-variants' | 'bundle';
export type ThumbnailEditorLayout = 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';
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
}

interface GenerateCreativeOptions {
  sceneType?: string;
  styleType?: string;
  productDescription?: string;
  userPrompt?: string;
  productName?: string | null;
  category?: string | null;
}

const MAX_FETCH_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ThumbnailEditorAiService {
  private readonly logger = new Logger(ThumbnailEditorAiService.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly storage: StorageService) {}

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
    const fetched = await this.fetchImage(input, { allowOwnStorage: Boolean(ownKey) });
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
    return this.generateAndStore(inputs, companyId, this.buildEditPrompt(inputs, options), 'edit');
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
    );
  }

  private async generateAndStore(
    inputs: ThumbnailEditorInputImage[],
    companyId: string,
    prompt: string,
    method: ThumbnailEditorMode,
  ): Promise<ThumbnailEditorCandidate[]> {
    if (inputs.length === 0) throw new BadRequestException('상품 사진이 필요합니다');

    const response = await this.getClient().models.generateContent({
      model: process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image-preview',
      contents: [
        {
          role: 'user',
          parts: [
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
      this.assertSupportedMime(mimeType);
      const key = this.candidateStorageKey(companyId, mimeType);
      const url = await this.storage.save(key, buffer, mimeType);
      candidates.push({
        url,
        storageKey: key,
        filename: `${method}-${candidates.length + 1}.${this.extForMime(mimeType)}`,
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
    const prompt = options.promptOverride?.trim()
      ? options.promptOverride
      : this.shouldUseGeneratePrompt(options)
        ? this.buildGeneratePrompt(options)
        : options.purpose === 'quality'
          ? QUALITY_EDIT_PROMPT
          : EDIT_PROMPT;

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
    this.assertSupportedMime(mimeType);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_FETCH_BYTES) {
      throw new BadRequestException('image too large');
    }
    return { buffer, mimeType };
  }

  private async fetchImage(
    rawUrl: string,
    opts: { allowOwnStorage?: boolean } = {},
  ): Promise<FetchedImage> {
    let url = rawUrl;
    for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
      if (!(opts.allowOwnStorage && this.storage.extractKey(url))) {
        this.assertPublicHttpUrl(url);
      } else {
        this.assertHttpUrl(url);
      }
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new BadRequestException('image url redirect missing location');
        url = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) {
        throw new BadRequestException(`image fetch failed: ${response.status}`);
      }
      const mimeType = (response.headers.get('content-type') ?? 'image/jpeg')
        .split(';')[0]
        .trim()
        .toLowerCase();
      this.assertSupportedMime(mimeType);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > MAX_FETCH_BYTES) {
        throw new BadRequestException('image too large');
      }
      return { buffer, mimeType };
    }
    throw new BadRequestException('image url redirected too many times');
  }

  private inputStorageKey(companyId: string, mimeType: string): string {
    return `thumbnail-inputs/${companyId}/${randomUUID()}.${this.extForMime(mimeType)}`;
  }

  private candidateStorageKey(companyId: string, mimeType: string): string {
    return `thumbnail-generations/${companyId}/${randomUUID()}.${this.extForMime(mimeType)}`;
  }

  private extForMime(mimeType: string): string {
    const ext = ALLOWED_MIME_TO_EXT[mimeType];
    if (!ext) throw new BadRequestException(`unsupported mime type: ${mimeType}`);
    return ext;
  }

  private assertSupportedMime(mimeType: string): void {
    if (!ALLOWED_MIME_TO_EXT[mimeType]) {
      throw new BadRequestException(`unsupported mime type: ${mimeType}`);
    }
  }

  private assertHttpUrl(raw: string): void {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new BadRequestException('invalid image url'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('image url protocol must be http(s)');
    }
  }

  private assertPublicHttpUrl(raw: string): void {
    this.assertHttpUrl(raw);
    const parsed = new URL(raw);
    const rawHost = parsed.hostname.toLowerCase();
    let host = rawHost;
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    const zoneIdx = host.indexOf('%');
    if (zoneIdx !== -1) host = host.slice(0, zoneIdx);
    if (host === 'localhost' || host === '') {
      throw new BadRequestException('image url host not allowed');
    }

    const ipKind = isIP(host);
    if (ipKind === 0) return;
    if (ipKind === 4) {
      if (this.isPrivateIPv4(host)) throw new BadRequestException('image url host not allowed');
      return;
    }
    const embeddedV4 = this.extractEmbeddedIPv4(host);
    if (embeddedV4) {
      if (this.isPrivateIPv4(embeddedV4)) throw new BadRequestException('image url host not allowed');
      return;
    }
    const blocked6 =
      host === '::1' ||
      host === '::' ||
      /^fe[89ab][0-9a-f]?:/.test(host) ||
      /^fc[0-9a-f]{2}:/.test(host) ||
      /^fd[0-9a-f]{2}:/.test(host);
    if (blocked6) throw new BadRequestException('image url host not allowed');
  }

  private extractEmbeddedIPv4(host: string): string | null {
    const mapText = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapText && isIP(mapText[1]) === 4) return mapText[1];
    const compatText = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (compatText && isIP(compatText[1]) === 4) return compatText[1];
    const decodeHex = (hi: string, lo: string): string => {
      const h = parseInt(hi, 16);
      const l = parseInt(lo, 16);
      return `${(h >> 8) & 0xff}.${h & 0xff}.${(l >> 8) & 0xff}.${l & 0xff}`;
    };
    const mapHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (mapHex) return decodeHex(mapHex[1], mapHex[2]);
    const compatHex = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (compatHex) return decodeHex(compatHex[1], compatHex[2]);
    return null;
  }

  private isPrivateIPv4(ip: string): boolean {
    return (
      /^127\./.test(ip) ||
      /^10\./.test(ip) ||
      /^192\.168\./.test(ip) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      /^169\.254\./.test(ip) ||
      /^0\./.test(ip) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
    );
  }
}
