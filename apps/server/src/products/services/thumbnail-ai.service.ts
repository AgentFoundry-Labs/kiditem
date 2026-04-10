import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import type { ThumbnailGrade, AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage, ComplianceGrade, ComplianceScores } from './types';

export type { AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage } from './types';

@Injectable()
export class ThumbnailAiService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailAiService.name);
  private client: GoogleGenAI | null = null;

  onModuleInit() {
    if (!process.env.GEMINI_API_KEY) {
      this.logger.warn('GEMINI_API_KEY 미설정 — AI 분석이 룰 기반 fallback으로 동작합니다');
    }
  }

  // ── 가이드라인 준수 판단 프롬프트 (광고 중단/검색 하락 리스크) ──
  private readonly COMPLIANCE_PROMPT = `당신은 쿠팡 대표이미지 정책 심사관입니다.
아래 상품 썸네일 이미지가 쿠팡 대표이미지 가이드라인 12가지 항목을 준수하는지 판단하세요.
각 항목이 위반인지(true/false), 확신도(0-100)를 함께 제공하세요.

## 가이드라인 12항목
1. background_not_white: 배경이 순백색(RGB 255,255,255)이 아님
2. has_text: 이미지에 텍스트/카피 삽입 (상품 자체에 인쇄된 것 제외)
3. has_extra_logo: 브랜드 로고 외 추가 로고/인증마크 삽입
4. has_discount_text: 할인율/프로모션/가격 문구
5. has_freebie_display: 사은품/증정품/덤 표시
6. has_overlay_effects: 그림자/테두리/장식/프레임 효과
7. has_gradient_background: 배경에 그라데이션/텍스처/패턴
8. has_background_objects: 배경에 소품/오브젝트 배치
9. product_fill_low: 상품이 이미지 면적의 85% 미만 차지
10. not_center_aligned: 상품이 이미지 중앙에 정렬되지 않음
11. product_cropped: 상품 일부가 이미지 밖으로 잘림
12. excessive_editing: 과도한 색보정/합성으로 실물과 괴리

상품명: {productName}
카테고리: {category}

응답 형식 (JSON만 출력):
{
  "violations": {
    "background_not_white": false,
    "has_text": false,
    "has_extra_logo": false,
    "has_discount_text": false,
    "has_freebie_display": false,
    "has_overlay_effects": false,
    "has_gradient_background": false,
    "has_background_objects": false,
    "product_fill_low": false,
    "not_center_aligned": false,
    "product_cropped": false,
    "excessive_editing": false
  },
  "confidence": {
    "background_not_white": 95,
    "has_text": 95,
    "has_extra_logo": 95,
    "has_discount_text": 95,
    "has_freebie_display": 95,
    "has_overlay_effects": 95,
    "has_gradient_background": 95,
    "has_background_objects": 95,
    "product_fill_low": 90,
    "not_center_aligned": 85,
    "product_cropped": 95,
    "excessive_editing": 80
  },
  "quality": {
    "estimatedFillPercent": 90,
    "centerOffsetPercent": 2,
    "aspectRatioValid": true
  }
}`;

  // ── CTR 품질 평가 프롬프트 (클릭률에 영향주는 시각 품질) ──
  private readonly QUALITY_PROMPT = `당신은 쿠팡 마켓플레이스 전문 썸네일 분석가입니다.
아래 상품 썸네일 이미지의 CTR(클릭률) 관점에서 시각 품질을 평가하고 JSON으로 점수를 매겨주세요.

## 평가 기준 (5개 항목, 총 100점)
1. 히어로 샷 품질 (0-25점): 촬영 앵글, 조명, 선명도, 입체감, 상품 매력도
2. 구도 및 배치 (0-25점): 중앙 정렬, 여백 균형, 세트/번들 배치, 시선 유도
3. 브랜드 일관성 (0-15점): 톤앤매너, 일관된 레이아웃, 브랜드 인식성
4. 모바일 최적화 (0-20점): 모바일 화면에서의 식별성, 주목도, 정보 전달력
5. 경쟁 차별화 (0-15점): 검색 결과 내 시각적 차별화, 클릭 유도 요소

상품명: {productName}
카테고리: {category}

응답 형식 (JSON만 출력):
{
  "overallScore": 72,
  "scores": { "heroShot": 20, "composition": 18, "branding": 10, "mobile": 14, "differentiation": 10 },
  "issues": [{ "type": "lighting", "severity": "warning", "message": "조명이 어두워 상품 디테일이 잘 보이지 않음" }],
  "suggestions": ["상품에 더 밝은 조명을 사용하세요"]
}`;

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

  /**
   * 가이드라인 준수만 체크 (편집 후 재분석 등)
   */
  async checkCompliance(
    imageUrl: string,
    productName: string,
    category?: string,
  ): Promise<{ complianceGrade: ComplianceGrade; complianceScores: ComplianceScores } | null> {
    try {
      const client = this.getClient();
      const originalUrl = this.toCoupangOriginal(imageUrl);
      const { data: imageData, mimeType } = await this.fetchImageAsBase64(originalUrl);

      const prompt = this.COMPLIANCE_PROMPT
        .replace('{productName}', productName)
        .replace('{category}', category ?? '미분류');

      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-live-preview',
        contents: [{ role: 'user', parts: [{ inlineData: { data: imageData, mimeType } }, { text: prompt }] }],
      });

      const text = response.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        violations?: Partial<ComplianceScores['violations']>;
        confidence?: Record<string, number>;
        quality?: Partial<ComplianceScores['quality']>;
      };

      return this.parseComplianceResponse(parsed);
    } catch (error) {
      this.logger.error(`가이드라인 체크 실패: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * CTR 품질만 분석 (가이드라인 체크 없이)
   */
  async analyzeQualityOnly(
    imageUrl: string,
    productName: string,
    category?: string,
  ): Promise<AiAnalysisResult | null> {
    try {
      const client = this.getClient();
      const originalUrl = this.toCoupangOriginal(imageUrl);
      const { data: imageData, mimeType } = await this.fetchImageAsBase64(originalUrl);

      const prompt = this.QUALITY_PROMPT
        .replace('{productName}', productName)
        .replace('{category}', category ?? '미분류');

      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-live-preview',
        contents: [{ role: 'user', parts: [{ inlineData: { data: imageData, mimeType } }, { text: prompt }] }],
      });

      const text = response.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        overallScore?: number;
        scores?: AnalysisScores;
        issues?: AnalysisIssue[];
        suggestions?: string[];
      };

      const overallScore = parsed.overallScore ?? 0;
      return {
        overallScore,
        grade: this.scoreToGrade(overallScore),
        scores: parsed.scores ?? null,
        issues: parsed.issues ?? [],
        suggestions: parsed.suggestions ?? [],
        method: 'ai',
        complianceGrade: null,
        complianceScores: null,
      };
    } catch (error) {
      this.logger.error(`품질 분석 실패: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * 품질 + 가이드라인 모두 분석 (단건 분석 시)
   */
  async analyzeWithGeminiVision(
    imageUrl: string,
    productName: string,
    category?: string,
  ): Promise<AiAnalysisResult | null> {
    try {
      const client = this.getClient();
      const originalUrl = this.toCoupangOriginal(imageUrl);
      const { data: imageData, mimeType } = await this.fetchImageAsBase64(originalUrl);

      // 가이드라인 + 품질을 병렬 호출
      const compliancePrompt = this.COMPLIANCE_PROMPT
        .replace('{productName}', productName)
        .replace('{category}', category ?? '미분류');
      const qualityPrompt = this.QUALITY_PROMPT
        .replace('{productName}', productName)
        .replace('{category}', category ?? '미분류');

      const [complianceRes, qualityRes] = await Promise.all([
        client.models.generateContent({
          model: 'gemini-3.1-flash-live-preview',
          contents: [{ role: 'user', parts: [{ inlineData: { data: imageData, mimeType } }, { text: compliancePrompt }] }],
        }),
        client.models.generateContent({
          model: 'gemini-3.1-flash-live-preview',
          contents: [{ role: 'user', parts: [{ inlineData: { data: imageData, mimeType } }, { text: qualityPrompt }] }],
        }),
      ]);

      // 가이드라인 파싱
      let complianceGrade: ComplianceGrade | null = null;
      let complianceScores: ComplianceScores | null = null;

      const complianceText = complianceRes.text ?? '';
      const complianceJson = complianceText.match(/\{[\s\S]*\}/);
      if (complianceJson) {
        const parsed = JSON.parse(complianceJson[0]);
        const result = this.parseComplianceResponse(parsed);
        complianceGrade = result.complianceGrade;
        complianceScores = result.complianceScores;
      }

      // 품질 파싱
      let overallScore = 0;
      let scores: AnalysisScores | null = null;
      let issues: AnalysisIssue[] = [];
      let suggestions: string[] = [];

      const qualityText = qualityRes.text ?? '';
      const qualityJson = qualityText.match(/\{[\s\S]*\}/);
      if (qualityJson) {
        const parsed = JSON.parse(qualityJson[0]) as {
          overallScore?: number;
          scores?: AnalysisScores;
          issues?: AnalysisIssue[];
          suggestions?: string[];
        };
        overallScore = parsed.overallScore ?? 0;
        scores = parsed.scores ?? null;
        issues = parsed.issues ?? [];
        suggestions = parsed.suggestions ?? [];
      }

      return {
        overallScore,
        grade: this.scoreToGrade(overallScore),
        scores,
        issues,
        suggestions,
        method: 'ai',
        complianceGrade,
        complianceScores,
      };
    } catch (error) {
      this.logger.error(`Gemini Vision 분석 실패: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  // ── 배치용 프롬프트 (멀티이미지 → JSON 배열) ──

  private readonly BATCH_COMPLIANCE_PROMPT = `당신은 쿠팡 대표이미지 정책 심사관입니다.
아래 상품 썸네일 이미지 **여러 장**을 각각 가이드라인 12항목 준수 여부를 판단하고, 이미지 순서대로 JSON 배열로 응답하세요.

## 가이드라인 12항목
1. background_not_white: 배경이 순백색(RGB 255,255,255)이 아님
2. has_text: 이미지에 텍스트/카피 삽입 (상품 자체에 인쇄된 것 제외)
3. has_extra_logo: 브랜드 로고 외 추가 로고/인증마크 삽입
4. has_discount_text: 할인율/프로모션/가격 문구
5. has_freebie_display: 사은품/증정품/덤 표시
6. has_overlay_effects: 그림자/테두리/장식/프레임 효과
7. has_gradient_background: 배경에 그라데이션/텍스처/패턴
8. has_background_objects: 배경에 소품/오브젝트 배치
9. product_fill_low: 상품이 이미지 면적의 85% 미만 차지
10. not_center_aligned: 상품이 이미지 중앙에 정렬되지 않음
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

  private readonly BATCH_QUALITY_PROMPT = `당신은 쿠팡 마켓플레이스 전문 썸네일 분석가입니다.
아래 상품 썸네일 이미지 **여러 장**의 CTR(클릭률) 관점에서 시각 품질을 각각 평가하고, 이미지 순서대로 JSON 배열로 응답하세요.

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

  async analyzeImagesBatch(
    items: Array<{ imageUrl: string; productName: string; productId: string; category?: string }>,
  ): Promise<Map<string, AiAnalysisResult>> {
    const results = new Map<string, AiAnalysisResult>();
    if (items.length === 0) return results;

    try {
      const client = this.getClient();

      // 이미지들을 병렬로 fetch
      const imageDataList = await Promise.all(
        items.map(async (item) => {
          try {
            const originalUrl = this.toCoupangOriginal(item.imageUrl);
            return await this.fetchImageAsBase64(originalUrl);
          } catch {
            return null;
          }
        }),
      );

      // 유효한 이미지만 필터
      const validItems: Array<{ item: typeof items[number]; imageData: { data: string; mimeType: string } }> = [];
      for (let i = 0; i < items.length; i++) {
        const data = imageDataList[i];
        if (data) {
          validItems.push({ item: items[i], imageData: data });
        }
      }

      if (validItems.length === 0) return results;

      // 상품 정보 목록
      const productList = validItems
        .map((v, idx) => `이미지 ${idx}: "${v.item.productName}" (카테고리: ${v.item.category ?? '미분류'})`)
        .join('\n');

      // 멀티이미지 parts 구성 (이미지 데이터 공유)
      const imageParts = validItems.map((v) => ({
        inlineData: { data: v.imageData.data, mimeType: v.imageData.mimeType },
      }));

      // compliance + quality 병렬 호출
      const [complianceRes, qualityRes] = await Promise.all([
        client.models.generateContent({
          model: 'gemini-3.1-flash-live-preview',
          contents: [{ role: 'user', parts: [...imageParts, { text: this.BATCH_COMPLIANCE_PROMPT.replace('{productList}', productList) }] }],
        }),
        client.models.generateContent({
          model: 'gemini-3.1-flash-live-preview',
          contents: [{ role: 'user', parts: [...imageParts, { text: this.BATCH_QUALITY_PROMPT.replace('{productList}', productList) }] }],
        }),
      ]);

      // compliance 파싱
      const complianceMap = new Map<number, { complianceGrade: ComplianceGrade; complianceScores: ComplianceScores }>();
      const complianceText = complianceRes.text ?? '';
      const complianceJsonMatch = complianceText.match(/\[[\s\S]*\]/);
      if (complianceJsonMatch) {
        const parsed = JSON.parse(complianceJsonMatch[0]) as Array<{
          index?: number;
          violations?: Partial<ComplianceScores['violations']>;
          confidence?: Record<string, number>;
          quality?: Partial<ComplianceScores['quality']>;
        }>;
        for (let i = 0; i < parsed.length; i++) {
          const entry = parsed[i];
          const idx = entry.index ?? i;
          complianceMap.set(idx, this.parseComplianceResponse(entry));
        }
      }

      // quality 파싱
      const qualityMap = new Map<number, { overallScore: number; scores: AnalysisScores | null; issues: AnalysisIssue[]; suggestions: string[] }>();
      const qualityText = qualityRes.text ?? '';
      const qualityJsonMatch = qualityText.match(/\[[\s\S]*\]/);
      if (qualityJsonMatch) {
        const parsed = JSON.parse(qualityJsonMatch[0]) as Array<{
          index?: number;
          overallScore?: number;
          scores?: AnalysisScores;
          issues?: AnalysisIssue[];
          suggestions?: string[];
        }>;
        for (let i = 0; i < parsed.length; i++) {
          const entry = parsed[i];
          const idx = entry.index ?? i;
          qualityMap.set(idx, {
            overallScore: entry.overallScore ?? 0,
            scores: entry.scores ?? null,
            issues: entry.issues ?? [],
            suggestions: entry.suggestions ?? [],
          });
        }
      }

      // 결과 병합
      for (let i = 0; i < validItems.length; i++) {
        const compliance = complianceMap.get(i);
        const quality = qualityMap.get(i);
        const overallScore = quality?.overallScore ?? 0;

        results.set(validItems[i].item.productId, {
          overallScore,
          grade: this.scoreToGrade(overallScore),
          scores: quality?.scores ?? null,
          issues: quality?.issues ?? [],
          suggestions: quality?.suggestions ?? [],
          method: 'ai',
          complianceGrade: compliance?.complianceGrade ?? null,
          complianceScores: compliance?.complianceScores ?? null,
        });
      }

      return results;
    } catch (error) {
      this.logger.error(`배치 Gemini Vision 분석 실패: ${error instanceof Error ? error.message : error}`);
      return results;
    }
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

  async generateImages(
    productName: string,
    category: string,
    productId: string,
  ): Promise<GeneratedImage[]> {
    try {
      const client = this.getClient();
      const timestamp = Date.now();

      const response = await client.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: `Professional product thumbnail for "${productName}" in category "${category}". White background, centered product, high quality, e-commerce style, square format.`,
        config: {
          numberOfImages: 3,
          aspectRatio: '1:1',
          outputMimeType: 'image/png',
        },
      });

      const outputDir = '/data/generated-thumbnails';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const results: GeneratedImage[] = [];

      const images = response.generatedImages ?? [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const filename = `${productId}_${timestamp}_${i}.png`;
        const filePath = path.join(outputDir, filename);

        if (img.image?.imageBytes) {
          const buffer = Buffer.from(img.image.imageBytes as string, 'base64');
          fs.writeFileSync(filePath, buffer);
          results.push({
            url: `/generated-thumbnails/${filename}`,
            filename,
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`Imagen 생성 실패 (product: ${productId}): ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  private readonly EDIT_PROMPT = `Edit this product thumbnail photo to comply with Coupang marketplace guidelines.

The background must be changed to a clean, pure white studio backdrop with no gradients, textures, patterns, or decorative objects visible. Remove all text overlays, watermarks, discount labels, promotional badges, freebie displays, extra logos, drop shadows, borders, and any decorative effects from the image entirely.

The product itself should remain exactly as it appears — do not alter, reshape, recolor, or distort the product in any way. Center the product in the frame so it occupies approximately 85-90% of the image area with even margins on all sides. If the product appears cropped or cut off at the edges, extend the visible area to show the complete product.

Maintain the natural color grading and lighting of the product. The final result should look like a professional e-commerce product photo taken in a white-background studio with soft, even lighting and no post-processing artifacts.`;

  private readonly QUALITY_EDIT_PROMPT = `Enhance this product thumbnail photo to maximize click-through rate for e-commerce. Do not change the product itself — only improve the photographic quality.

Improve the studio lighting to create soft, diffused highlights that reveal product textures and details. Adjust the exposure and white balance for a clean, professional look. Sharpen the product edges slightly for better mobile-screen visibility.

If the composition feels unbalanced, subtly adjust the product positioning to follow the rule of thirds while keeping it centered. Ensure the product fills approximately 85-90% of the frame with even margins. The background should remain pure white.

The final image should look like it was taken by a professional product photographer with a three-point softbox setup, emphasizing the product's key features and creating visual depth through subtle shadow and highlight work.`;

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

      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: imageData, mimeType } },
              { text: editPrompt },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '2K',
          },
        },
      });

      const outputDir = '/data/generated-thumbnails';
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
