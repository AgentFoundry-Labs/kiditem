import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import type { ThumbnailGrade, AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage, ComplianceGrade, ComplianceScores, ImageSpec, ImageSpecIssue } from './types';

export type { AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage, ImageSpec } from './types';

@Injectable()
export class ThumbnailAiService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailAiService.name);
  private static readonly GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
  private client: GoogleGenAI | null = null;

  onModuleInit() {
    if (!process.env.GEMINI_API_KEY) {
      this.logger.warn('GEMINI_API_KEY 미설정 — AI 분석이 룰 기반 fallback으로 동작합니다');
    }
  }

  // ── 가이드라인 준수 판단 프롬프트 ──
  private readonly COMPLIANCE_PROMPT = `당신은 쿠팡 대표이미지 정책 심사관입니다.
아래 상품 썸네일 이미지를 각각 가이드라인 12항목 준수 여부를 판단하고, 이미지 순서대로 JSON 배열로 응답하세요.

## 가이드라인 12항목
1. background_not_white: 배경이 순백색(RGB 255,255,255)이 아님
2. has_text: 상품 위에 포토샵 등으로 텍스트/카피를 덧붙인 경우만 위반. 상품 자체에 원래 인쇄·각인·자수된 브랜드명, 로고, 라벨 등은 위반이 아님
3. has_extra_logo: 이미지 편집으로 추가한 로고/인증마크/워터마크. 상품 자체에 원래 있는 브랜드 로고는 위반이 아님
4. has_discount_text: 할인율/프로모션/가격 문구
5. has_freebie_display: 사은품/증정품/덤 표시
6. has_overlay_effects: 그림자/테두리/장식/프레임 효과
7. has_gradient_background: 배경에 그라데이션/텍스처/패턴
8. has_background_objects: 배경에 소품/오브젝트 배치
9. product_fill_low: 상품이 이미지 면적의 85% 미만 차지
10. not_center_aligned: 상품의 무게 중심이 이미지 중앙에서 크게(10% 이상) 벗어난 경우만 위반. 약간의 편차는 허용
11. product_cropped: 상품 일부가 이미지 밖으로 잘림
12. excessive_editing: 과도한 색보정/합성으로 실물과 괴리

상품 정보:
{productList}

응답 형식 (JSON 배열만 출력):
[
  {
    "index": 0,
    "violations": { "background_not_white": false, "has_text": false, ... },
    "confidence": { "background_not_white": 95, ... },
    "quality": { "estimatedFillPercent": 90, "centerOffsetPercent": 2, "aspectRatioValid": true }
  }
]`;

  // ── CTR 품질 평가 프롬프트 ──
  private readonly QUALITY_PROMPT = `당신은 쿠팡 마켓플레이스 전문 썸네일 분석가입니다.
아래 상품 썸네일 이미지의 CTR(클릭률) 관점에서 시각 품질을 각각 평가하고, 이미지 순서대로 JSON 배열로 응답하세요.

## 평가 기준 (5개 항목, 총 100점)
1. 히어로 샷 품질 (0-25점): 촬영 앵글, 조명, 선명도, 입체감, 상품 매력도
2. 구도 및 배치 (0-25점): 중앙 정렬, 여백 균형, 세트/번들 배치, 시선 유도
3. 브랜드 일관성 (0-15점): 톤앤매너, 일관된 레이아웃, 브랜드 인식성
4. 모바일 최적화 (0-20점): 모바일 화면에서의 식별성, 주목도, 정보 전달력
5. 경쟁 차별화 (0-15점): 검색 결과 내 시각적 차별화, 클릭 유도 요소

상품 정보:
{productList}

응답 형식 (JSON 배열만 출력):
[
  {
    "index": 0,
    "overallScore": 72,
    "scores": { "heroShot": 20, "composition": 18, "branding": 10, "mobile": 14, "differentiation": 10 },
    "issues": [{ "type": "lighting", "severity": "warning", "message": "조명이 어두움" }],
    "suggestions": ["더 밝은 조명 사용"]
  }
]`;

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
        contents: [{ role: 'user', parts: [...imageParts, { text: this.COMPLIANCE_PROMPT.replace('{productList}', productList) }] }],
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
        contents: [{ role: 'user', parts: [...imageParts, { text: this.QUALITY_PROMPT.replace('{productList}', productList) }] }],
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

  private readonly EDIT_PROMPT = `Edit this product thumbnail photo to comply with Coupang marketplace guidelines. Reference images above show the target style — match the white background, product centering, fill ratio, and clean studio look.

Rules:
1. BACKGROUND: Change to clean, pure white. No gradients, textures, patterns, or decorative objects.
2. REMOVE: All text overlays, watermarks, discount labels, promotional badges, freebie displays, extra logos, drop shadows, borders, and decorative effects.
3. MAIN PRODUCT FOCUS: Identify the main product (usually the packaged item or the largest single item). Keep only the main product and remove scattered parts, loose accessories, duplicate angles, or lifestyle props. The thumbnail should show one clean hero shot of the product.
4. DO NOT MODIFY THE PRODUCT: The product itself must be preserved exactly as-is. Do NOT alter, erase, or simplify any patterns, prints, textures, graphics, text, or design elements that are part of the product (e.g., prints on fabric, packaging graphics, embossed text, logos printed on the item). Only the background and added overlays should be changed.
5. DO NOT ADD: Never add new objects, products, or elements that are not in the original image.
6. COMPOSITION: Center the main product. It should fill approximately 85-90% of the image area with even margins.
7. LIGHTING: Maintain natural color grading. The result should look like a professional studio photo with soft, even lighting.`;

  private readonly QUALITY_EDIT_PROMPT = `Enhance this product thumbnail photo to maximize click-through rate for e-commerce. Do not change the product itself — only improve the photographic quality.

Improve the studio lighting to create soft, diffused highlights that reveal product textures and details. Adjust the exposure and white balance for a clean, professional look. Sharpen the product edges slightly for better mobile-screen visibility.

If the composition feels unbalanced, subtly adjust the product positioning to follow the rule of thirds while keeping it centered. Ensure the product fills approximately 85-90% of the frame with even margins. The background should remain pure white.

The final image should look like it was taken by a professional product photographer with a three-point softbox setup, emphasizing the product's key features and creating visual depth through subtle shadow and highlight work.`;

  private readonly GENERATE_PROMPT = `Reference images above show the target style for Coupang marketplace thumbnails.

You are given product photos labeled below.{compositionLine}

Create a single clean e-commerce thumbnail:
1. Pure white background, no gradients or patterns
2. Show the main product centered, filling 85-90% of the frame with even margins
3. If the product is a set/bundle, arrange items neatly as shown in the reference examples
4. Remove all text overlays, watermarks, and decorative effects added on top of the image — but do NOT alter the product itself
5. Do NOT modify, erase, or simplify any patterns, prints, textures, graphics, or design elements that are part of the product (e.g., fabric prints, packaging graphics, logos on the item)
6. Do NOT add any elements not visible in the provided photos
7. The result should look like a professional studio product photo with soft, even lighting`;

  async generateFromInputs(
    images: Array<{ data: string; mimeType: string; label: string }>,
    composition: string | undefined,
    purpose: 'compliance' | 'quality',
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
          inputParts.push({ text: 'Reference examples:' });
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
      const prompt = purpose === 'quality'
        ? this.QUALITY_EDIT_PROMPT
        : this.GENERATE_PROMPT.replace('{compositionLine}', compositionLine);
      inputParts.push({ text: prompt });

      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{ role: 'user', parts: inputParts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
        },
      });

      const outputDir = path.join(process.cwd(), 'generated-thumbnails');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const results: GeneratedImage[] = [];
      const parts = response.candidates?.[0]?.content?.parts ?? [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.inlineData?.data) {
          const filename = `editor_${timestamp}_${i}.png`;
          const filePath = path.join(outputDir, filename);
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(filePath, buffer);
          results.push({ url: `/generated-thumbnails/${filename}`, filename });
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`썸네일 생성 실패: ${error instanceof Error ? error.message : error}`);
      throw error;
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
      const editPrompt = purpose === 'quality' ? this.QUALITY_EDIT_PROMPT : this.EDIT_PROMPT;

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
            inputParts.push({ text: 'These are good examples of compliant product thumbnails:' });
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

      const outputDir = path.join(process.cwd(), 'generated-thumbnails');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const results: GeneratedImage[] = [];
      const parts = response.candidates?.[0]?.content?.parts ?? [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.inlineData?.data) {
          const filename = `${productId}_edit_${timestamp}_${i}.png`;
          const filePath = path.join(outputDir, filename);
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(filePath, buffer);
          results.push({
            url: `/generated-thumbnails/${filename}`,
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
      throw error;
    }
  }
}
