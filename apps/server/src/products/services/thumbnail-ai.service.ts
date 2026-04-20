import { Injectable, Logger, OnModuleInit, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as sharp from 'sharp';
import { StorageService } from '../../common/storage/storage.service';
import type { ThumbnailGrade, AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage, ComplianceGrade, ComplianceScores, ImageSpec, ImageSpecIssue } from './types';
import {
  COMPLIANCE_PROMPT,
  QUALITY_PROMPT,
  EDIT_PROMPT,
  QUALITY_EDIT_PROMPT,
  GENERATE_PROMPT,
  CREATIVE_PROMPT,
  USER_PROMPT_PREFIX,
  CREATIVE_STYLE_REFERENCE_HINT,
  COMPLIANCE_REFERENCE_HEADER,
  GENERATE_REFERENCE_HEADER,
} from './thumbnail-prompts';
import {
  classifyCategory,
  buildGenerateScenarioBlock,
  buildCreativeScenarioBlock,
  type EditCase,
} from './thumbnail-prompt-scenarios';

export type { AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage, ImageSpec } from './types';

@Injectable()
export class ThumbnailAiService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailAiService.name);
  private static readonly GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
  private client: GoogleGenAI | null = null;

  constructor(private readonly storage: StorageService) {}

  onModuleInit() {
    if (!process.env.GEMINI_API_KEY) {
      this.logger.warn('GEMINI_API_KEY 미설정 — AI 분석이 룰 기반 fallback으로 동작합니다');
    }
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY ?? '';
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  scoreToGrade(score: number): ThumbnailGrade {
    if (score >= 90) return 'S';
    if (score >= 75) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    return 'F';
  }

  calculateComplianceGrade(scores: ComplianceScores): { grade: ComplianceGrade } {
    const { violations, confidence, quality } = scores;

    // 확정 위반 = violation true AND confidence >= 60
    const violationKeys = Object.keys(violations) as Array<keyof typeof violations>;
    const hasConfirmedViolation = violationKeys.some(
      (key) => violations[key] === true && (confidence[key] ?? 0) >= 60,
    );

    if (hasConfirmedViolation) {
      return { grade: 'FAIL' };
    }

    // 경계값: fill 80~85%, offset >5%, 저확신 flag(violation true but confidence < 60)
    const fillPercent = quality.estimatedFillPercent;
    const isBorderlineFill = fillPercent >= 80 && fillPercent < 85;
    const isBorderlineOffset = quality.centerOffsetPercent > 5;
    const hasLowConfidenceFlag = violationKeys.some(
      (key) => violations[key] === true && (confidence[key] ?? 0) < 60,
    );

    if (isBorderlineFill || isBorderlineOffset || hasLowConfidenceFlag) {
      return { grade: 'WARN' };
    }

    return { grade: 'PASS' };
  }

  toCoupangOriginal(url: string): string {
    if (!url) return url;
    // Convert coupang thumbnail CDN URLs to original resolution
    return url
      .replace(/\/thumbnail\/\d+x\d+\//, '/original/')
      .replace(/\/q\d+\//, '/q100/')
      .replace(/\/thumbnail_/, '/original_');
  }

  fetchImageAsBase64Public(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    const originalUrl = this.toCoupangOriginal(imageUrl);
    return this.fetchImageAsBase64(originalUrl);
  }

  private fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const protocol = imageUrl.startsWith('https') ? https : http;
      protocol.get(imageUrl, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = (res.headers['content-type'] as string) || 'image/jpeg';
          resolve({ data: buffer.toString('base64'), mimeType: contentType });
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private static readonly VIOLATION_KEYS: Array<keyof ComplianceScores['violations']> = [
    'background_not_white', 'has_text', 'has_extra_logo', 'has_discount_text',
    'has_freebie_display', 'has_overlay_effects', 'has_gradient_background',
    'has_background_objects', 'product_fill_low', 'not_center_aligned',
    'product_cropped', 'excessive_editing',
  ];

  private parseComplianceResponse(raw: {
    violations?: Partial<ComplianceScores['violations']>;
    confidence?: Record<string, number>;
    quality?: Partial<ComplianceScores['quality']>;
  }): { complianceGrade: ComplianceGrade; complianceScores: ComplianceScores } {
    const rawViolations = raw.violations ?? {};
    const violations = Object.fromEntries(
      ThumbnailAiService.VIOLATION_KEYS.map((key) => [key, rawViolations[key] ?? true]),
    ) as ComplianceScores['violations'];

    const confidence = raw.confidence ?? {};
    const rawQuality = raw.quality ?? {};

    const complianceScores: ComplianceScores = {
      violations,
      confidence,
      quality: {
        estimatedFillPercent: rawQuality.estimatedFillPercent ?? 0,
        centerOffsetPercent: rawQuality.centerOffsetPercent ?? 0,
        aspectRatioValid: rawQuality.aspectRatioValid ?? false,
      },
      violationCount: ThumbnailAiService.VIOLATION_KEYS.filter((key) => violations[key] === true).length,
    };

    return {
      complianceGrade: this.calculateComplianceGrade(complianceScores).grade,
      complianceScores,
    };
  }

  private raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(new Error('ABORTED'));
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true });
      }),
    ]);
  }

  /**
   * 가이드라인 준수 체크 (1개 또는 여러 개 이미지)
   */
  async checkCompliance(
    items: Array<{ imageUrl: string; productName: string; productId: string; category?: string }>,
    signal?: AbortSignal,
  ): Promise<Map<string, { complianceGrade: ComplianceGrade; complianceScores: ComplianceScores }>> {
    const results = new Map<string, { complianceGrade: ComplianceGrade; complianceScores: ComplianceScores }>();
    if (items.length === 0) return results;
    if (signal?.aborted) return results;

    try {
      const client = this.getClient();

      const imageDataList = await this.raceWithAbort(Promise.all(
        items.map(async (item) => {
          try {
            return await this.fetchImageAsBase64(this.toCoupangOriginal(item.imageUrl));
          } catch {
            return null;
          }
        }),
      ), signal);

      if (signal?.aborted) return results;

      const validItems: Array<{ item: typeof items[number]; imageData: { data: string; mimeType: string } }> = [];
      for (let i = 0; i < items.length; i++) {
        const data = imageDataList[i];
        if (data) validItems.push({ item: items[i], imageData: data });
      }
      if (validItems.length === 0) return results;

      const productList = validItems
        .map((v, idx) => `이미지 ${idx}: "${v.item.productName}" (카테고리: ${v.item.category ?? '미분류'})`)
        .join('\n');

      const imageParts = validItems.map((v) => ({
        inlineData: { data: v.imageData.data, mimeType: v.imageData.mimeType },
      }));

      const response = await this.raceWithAbort(client.models.generateContent({
        model: ThumbnailAiService.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [...imageParts, { text: COMPLIANCE_PROMPT.replace('{productList}', productList) }] }],
      }), signal);

      const text = response.text ?? '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          index?: number;
          violations?: Partial<ComplianceScores['violations']>;
          confidence?: Record<string, number>;
          quality?: Partial<ComplianceScores['quality']>;
        }>;
        for (let i = 0; i < parsed.length; i++) {
          const entry = parsed[i];
          const idx = entry.index ?? i;
          if (idx < validItems.length) {
            results.set(validItems[idx].item.productId, this.parseComplianceResponse(entry));
          }
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`가이드라인 체크 실패: ${error instanceof Error ? error.message : error}`);
      return results;
    }
  }

  /**
   * CTR 품질 분석 (1개 또는 여러 개 이미지)
   */
  async analyzeQuality(
    items: Array<{ imageUrl: string; productName: string; productId: string; category?: string }>,
    signal?: AbortSignal,
  ): Promise<Map<string, AiAnalysisResult>> {
    const results = new Map<string, AiAnalysisResult>();
    if (items.length === 0) return results;
    if (signal?.aborted) return results;

    try {
      const client = this.getClient();

      const imageDataList = await this.raceWithAbort(Promise.all(
        items.map(async (item) => {
          try {
            return await this.fetchImageAsBase64(this.toCoupangOriginal(item.imageUrl));
          } catch {
            return null;
          }
        }),
      ), signal);

      if (signal?.aborted) return results;

      const validItems: Array<{ item: typeof items[number]; imageData: { data: string; mimeType: string } }> = [];
      for (let i = 0; i < items.length; i++) {
        const data = imageDataList[i];
        if (data) validItems.push({ item: items[i], imageData: data });
      }
      if (validItems.length === 0) return results;

      const productList = validItems
        .map((v, idx) => `이미지 ${idx}: "${v.item.productName}" (카테고리: ${v.item.category ?? '미분류'})`)
        .join('\n');

      const imageParts = validItems.map((v) => ({
        inlineData: { data: v.imageData.data, mimeType: v.imageData.mimeType },
      }));

      const response = await this.raceWithAbort(client.models.generateContent({
        model: ThumbnailAiService.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [...imageParts, { text: QUALITY_PROMPT.replace('{productList}', productList) }] }],
      }), signal);

      const text = response.text ?? '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          index?: number;
          overallScore?: number;
          scores?: AnalysisScores;
          issues?: AnalysisIssue[];
          suggestions?: string[];
        }>;
        for (let i = 0; i < parsed.length; i++) {
          const entry = parsed[i];
          const idx = entry.index ?? i;
          if (idx < validItems.length) {
            const overallScore = entry.overallScore ?? 0;
            results.set(validItems[idx].item.productId, {
              overallScore,
              grade: this.scoreToGrade(overallScore),
              scores: entry.scores ?? null,
              issues: entry.issues ?? [],
              suggestions: entry.suggestions ?? [],
              method: 'ai',
              complianceGrade: null,
              complianceScores: null,
            });
          }
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`품질 분석 실패: ${error instanceof Error ? error.message : error}`);
      return results;
    }
  }


  private parseImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } {
    try {
      if (mimeType.includes('png') && buffer.length >= 24) {
        return {
          width: buffer.readUInt32BE(16),
          height: buffer.readUInt32BE(20),
        };
      }

      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        let offset = 2;
        while (offset < buffer.length - 1) {
          if (buffer[offset] !== 0xff) break;
          const marker = buffer[offset + 1];
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
            return {
              height: buffer.readUInt16BE(offset + 5),
              width: buffer.readUInt16BE(offset + 7),
            };
          }
          const segLen = buffer.readUInt16BE(offset + 2);
          offset += 2 + segLen;
        }
      }
    } catch {
      // 파싱 실패 시 0x0 반환
    }
    return { width: 0, height: 0 };
  }

  async checkImageSpec(imageUrl: string): Promise<ImageSpec> {
    const originalUrl = this.toCoupangOriginal(imageUrl);
    const { data, mimeType } = await this.fetchImageAsBase64(originalUrl);
    const buffer = Buffer.from(data, 'base64');
    const { width, height } = this.parseImageDimensions(buffer, mimeType);

    const issues: ImageSpecIssue[] = [];

    if (width < 1000 || height < 1000) {
      issues.push({ type: 'low_resolution', severity: 'fail', message: `최소 해상도 미달 (${width}x${height}, 최소 1000x1000)` });
    } else if (width < 2000 || height < 2000) {
      issues.push({ type: 'low_resolution', severity: 'warn', message: `권장 해상도 미달 (${width}x${height}, 권장 2000x2000)` });
    }

    if (width > 0 && height > 0 && Math.abs(width / height - 1) > 0.01) {
      issues.push({ type: 'aspect_ratio', severity: 'fail', message: `1:1 비율 아님 (${width}x${height})` });
    }

    if (buffer.length > 10 * 1024 * 1024) {
      issues.push({ type: 'file_too_large', severity: 'fail', message: `파일 크기 초과 (${Math.round(buffer.length / 1024 / 1024)}MB, 최대 10MB)` });
    }

    return {
      width,
      height,
      aspectRatio: height > 0 ? Math.round((width / height) * 100) / 100 : 0,
      fileSizeKB: Math.round(buffer.length / 1024),
      format: mimeType,
      issues,
    };
  }

  analyzeWithRules(product: {
    id: string;
    name: string;
    imageUrl: string | null;
  }): AiAnalysisResult {
    let overallScore = 60;
    const issues: AnalysisIssue[] = [];
    const suggestions: string[] = [];

    if (!product.imageUrl) {
      overallScore -= 40;
      issues.push({
        type: 'no_image',
        severity: 'critical',
        message: '대표 이미지 미등록',
      });
      suggestions.push('대표 이미지를 등록하세요');

      return {
        overallScore,
        grade: this.scoreToGrade(overallScore),
        scores: null,
        issues,
        suggestions,
        method: 'rule',
        complianceGrade: 'FAIL',
        complianceScores: null,
      };
    }

    return {
      overallScore,
      grade: this.scoreToGrade(overallScore),
      scores: null,
      issues,
      suggestions,
      method: 'rule',
      complianceGrade: null,
      complianceScores: null,
    };
  }

  private static readonly REFERENCE_DIR = path.join(process.cwd(), 'assets', 'thumbnail-references');
  private referenceCache: Array<{ data: string; mimeType: string }> | null = null;

  async generateFromInputs(
    images: Array<{ data: string; mimeType: string; label: string }>,
    composition: string | undefined,
    purpose: 'compliance' | 'quality',
    userPrompt?: string,
    categoryPath?: string | null,
    editCase: EditCase = 'single',
  ): Promise<GeneratedImage[]> {
    try {
      const client = this.getClient();
      const timestamp = Date.now();

      const inputParts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> = [];

      // 레퍼런스 이미지
      try {
        if (!this.referenceCache) {
          const refDir = ThumbnailAiService.REFERENCE_DIR;
          const refFiles = fs.existsSync(refDir)
            ? fs.readdirSync(refDir).filter((f) => /\.(png|jpg|jpeg)$/i.test(f)).sort()
            : [];
          this.referenceCache = refFiles.map((f) => {
            const buffer = fs.readFileSync(path.join(refDir, f));
            const ext = f.split('.').pop()?.toLowerCase();
            return { data: buffer.toString('base64'), mimeType: ext === 'png' ? 'image/png' : 'image/jpeg' };
          });
        }
        if (this.referenceCache.length > 0) {
          inputParts.push({ text: GENERATE_REFERENCE_HEADER });
          for (const ref of this.referenceCache) {
            inputParts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
          }
        }
      } catch {
        this.logger.warn('레퍼런스 이미지 로드 실패');
      }

      // 입력 이미지
      for (const img of images) {
        inputParts.push({ text: `${img.label}:` });
        inputParts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
      }

      // 프롬프트
      const compositionLine = composition ? ` Product composition: "${composition}"` : '';
      const scenarioBlock = buildGenerateScenarioBlock(classifyCategory(categoryPath), editCase);
      let prompt = purpose === 'quality'
        ? QUALITY_EDIT_PROMPT
        : GENERATE_PROMPT
            .replace('{compositionLine}', compositionLine)
            .replace('{scenarioBlock}', scenarioBlock);
      if (userPrompt) {
        prompt += `\n\n${USER_PROMPT_PREFIX}\n${userPrompt}`;
      }
      inputParts.push({ text: prompt });

      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{ role: 'user', parts: inputParts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
        },
      });

      const results: GeneratedImage[] = [];
      const parts = response.candidates?.[0]?.content?.parts ?? [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.inlineData?.data) {
          const filename = `editor_${timestamp}_${i}.png`;
          const key = `generated-thumbnails/${filename}`;
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const url = await this.storage.save(key, buffer, 'image/png');
          results.push({ url, filename });
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`썸네일 생성 실패: ${error instanceof Error ? error.message : error}`);
      throw this.mapGeminiError(error);
    }
  }

  async generateCreative(
    images: Array<{ data: string; mimeType: string; label: string }>,
    sceneType: string,
    styleType: string,
    productDescription?: string,
    userPrompt?: string,
    categoryPath?: string | null,
  ): Promise<GeneratedImage[]> {
    try {
      const client = this.getClient();
      const timestamp = Date.now();

      const inputParts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> = [];

      // 입력 이미지 (레퍼런스 이미지 불포함 — creative는 자유 배경)
      for (const img of images) {
        inputParts.push({ text: `${img.label}:` });
        inputParts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
      }

      // 배경 레퍼런스가 있으면 스타일 참고 지시 추가
      const hasReference = images.some((img) => img.label === 'Style reference');
      const refLine = hasReference ? CREATIVE_STYLE_REFERENCE_HINT : '';

      // 프롬프트 조립
      const productDescriptionLine = productDescription ? ` Product: "${productDescription}"` : '';
      const scenarioBlock = buildCreativeScenarioBlock(classifyCategory(categoryPath));
      let prompt = CREATIVE_PROMPT
        .replace('{productDescriptionLine}', productDescriptionLine)
        .replace('{sceneType}', sceneType)
        .replace('{styleType}', styleType)
        .replace('{scenarioBlock}', scenarioBlock);
      prompt += refLine;

      if (userPrompt) {
        prompt += `\n\n${USER_PROMPT_PREFIX}\n${userPrompt}`;
      }

      inputParts.push({ text: prompt });

      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{ role: 'user', parts: inputParts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
        },
      });

      const results: GeneratedImage[] = [];
      const parts = response.candidates?.[0]?.content?.parts ?? [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.inlineData?.data) {
          const filename = `creative_${timestamp}_${i}.png`;
          const key = `generated-thumbnails/${filename}`;
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const url = await this.storage.save(key, buffer, 'image/png');
          results.push({ url, filename });
        }
      }

      if (results.length === 0) {
        this.logger.warn('Gemini creative 생성 결과 없음');
      }

      return results;
    } catch (error) {
      this.logger.error(`Creative 생성 실패: ${error instanceof Error ? error.message : error}`);
      throw this.mapGeminiError(error);
    }
  }

  async editImage(
    imageUrl: string,
    productId: string,
    purpose: 'compliance' | 'quality' = 'compliance',
  ): Promise<GeneratedImage[]> {
    try {
      const client = this.getClient();
      const timestamp = Date.now();
      const originalUrl = this.toCoupangOriginal(imageUrl);
      const { data: imageData, mimeType } = await this.fetchImageAsBase64(originalUrl);
      const editPrompt = purpose === 'quality' ? QUALITY_EDIT_PROMPT : EDIT_PROMPT;

      // compliance 편집 시 레퍼런스 이미지 포함
      const inputParts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> = [];
      if (purpose === 'compliance') {
        try {
          if (!this.referenceCache) {
            const refDir = ThumbnailAiService.REFERENCE_DIR;
            const refFiles = fs.existsSync(refDir)
              ? fs.readdirSync(refDir).filter((f) => /\.(png|jpg|jpeg)$/i.test(f)).sort()
              : [];
            this.referenceCache = refFiles.map((f) => {
              const buffer = fs.readFileSync(path.join(refDir, f));
              const ext = f.split('.').pop()?.toLowerCase();
              return { data: buffer.toString('base64'), mimeType: ext === 'png' ? 'image/png' : 'image/jpeg' };
            });
          }
          if (this.referenceCache.length > 0) {
            inputParts.push({ text: COMPLIANCE_REFERENCE_HEADER });
            for (const ref of this.referenceCache) {
              inputParts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
            }
            inputParts.push({ text: 'Now edit the following product image to match the same style:' });
          }
        } catch {
          this.logger.warn('레퍼런스 이미지 로드 실패, 레퍼런스 없이 편집 진행');
        }
      }
      inputParts.push(
        { inlineData: { data: imageData, mimeType } },
        { text: editPrompt },
      );

      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{ role: 'user', parts: inputParts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '2K',
          },
        },
      });

      const results: GeneratedImage[] = [];
      const parts = response.candidates?.[0]?.content?.parts ?? [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.inlineData?.data) {
          const filename = `${productId}_edit_${timestamp}_${i}.png`;
          const key = `generated-thumbnails/${filename}`;
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const url = await this.storage.save(key, buffer, 'image/png');
          results.push({
            url,
            filename,
          });
        }
      }

      if (results.length === 0) {
        this.logger.warn(`Gemini 이미지 편집 결과 없음 (product: ${productId})`);
      }

      return results;
    } catch (error) {
      this.logger.error(`Gemini 이미지 편집 실패 (product: ${productId}): ${error instanceof Error ? error.message : error}`);
      throw this.mapGeminiError(error);
    }
  }

  private mapGeminiError(error: unknown): HttpException {
    if (error instanceof HttpException) return error;

    const status = (error as { status?: number })?.status;
    const message = error instanceof Error ? error.message : String(error);

    if (
      status === 429 ||
      /RESOURCE_EXHAUSTED/i.test(message) ||
      /spending cap/i.test(message) ||
      /quota/i.test(message) ||
      /"code"\s*:\s*429/.test(message)
    ) {
      return new ServiceUnavailableException(
        'Gemini API 사용량 한도를 초과했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.',
      );
    }

    if (status === 401 || status === 403 || /API key/i.test(message)) {
      return new ServiceUnavailableException('Gemini API 인증 오류 — 관리자에게 문의하세요.');
    }

    return new ServiceUnavailableException('썸네일 생성에 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요.');
  }

  /**
   * Auto-edit 파이프라인 전용 이미지 분류.
   * Gemini Lite 에게 상품 이미지+카테고리를 주고, bucket / editCase / suggestBoxImage / reason 을 JSON 으로 받는다.
   */
  async classifyForAutoEdit(
    imageData: { data: string; mimeType: string },
    categoryPath: string | null,
  ): Promise<{
    bucket: 'toy' | 'stationery' | 'living' | 'furniture' | 'default';
    editCase: EditCase;
    suggestBoxImage: boolean;
    reason: string;
  }> {
    const fallbackBucket = classifyCategory(categoryPath);
    const fallback = {
      bucket: fallbackBucket,
      editCase: 'single' as EditCase,
      suggestBoxImage: false,
      reason: 'fallback (no Gemini response)',
    };

    if (!process.env.GEMINI_API_KEY) return fallback;

    const prompt = `당신은 쿠팡 썸네일 자동 재편집 파이프라인의 분류기입니다.
주어진 상품 이미지와 카테고리 경로를 보고, 아래 네 가지를 JSON 으로만 응답하세요.

카테고리 경로: ${categoryPath ?? '미분류'}

## 스키마
{
  "bucket": "toy" | "stationery" | "living" | "furniture" | "default",
  "editCase": "single" | "compose" | "color-variants" | "bundle",
  "suggestBoxImage": true | false,
  "reason": "한국어 1-2문장 사유"
}

## 가이드
- bucket: 카테고리 경로 + 이미지 실물로 가장 적합한 버킷 (완구/취미=toy, 문구/오피스=stationery, 생활용품=living, 가구/홈데코=furniture, 그 외=default).
- editCase: 이미지 구성을 보고 추정. 상품 1개 정면샷=single, 박스/포장 언급 필요=compose, 색상 변형 여러 개=color-variants, 서로 다른 상품 묶음=bundle.
- suggestBoxImage: true 는 "박스/포장 이미지를 추가로 받으면 썸네일 품질이 유의미하게 오를 것" 이라고 강하게 판단할 때만. 평이한 단품 샷이면 false.
- reason: 왜 그 판단을 했는지 한국어로 1-2문장.

JSON 만 출력. 다른 텍스트 금지.`;

    try {
      const client = this.getClient();
      const response = await client.models.generateContent({
        model: ThumbnailAiService.GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: imageData.data, mimeType: imageData.mimeType } },
              { text: prompt },
            ],
          },
        ],
      });

      const text = response.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(`classifyForAutoEdit: JSON 매칭 실패 → fallback 사용`);
        return fallback;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<{
        bucket: string;
        editCase: string;
        suggestBoxImage: boolean;
        reason: string;
      }>;

      const validBuckets = ['toy', 'stationery', 'living', 'furniture', 'default'] as const;
      const validEditCases = ['single', 'compose', 'color-variants', 'bundle'] as const;

      const bucket = (validBuckets as readonly string[]).includes(parsed.bucket ?? '')
        ? (parsed.bucket as typeof fallback.bucket)
        : fallbackBucket;
      const editCase = (validEditCases as readonly string[]).includes(parsed.editCase ?? '')
        ? (parsed.editCase as EditCase)
        : 'single';

      return {
        bucket,
        editCase,
        suggestBoxImage: parsed.suggestBoxImage === true,
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '',
      };
    } catch (err) {
      this.logger.warn(
        `classifyForAutoEdit 실패 → fallback 사용: ${err instanceof Error ? err.message : err}`,
      );
      return fallback;
    }
  }
}
