import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import type { ThumbnailGrade, AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage } from './types';

export type { AnalysisScores, AnalysisIssue, AiAnalysisResult, GeneratedImage } from './types';

@Injectable()
export class ThumbnailAiService {
  private readonly logger = new Logger(ThumbnailAiService.name);
  private client: GoogleGenAI | null = null;

  private readonly ANALYSIS_PROMPT = `당신은 쿠팡 마켓플레이스 전문 썸네일 분석가입니다.
아래 상품 썸네일 이미지를 쿠팡 공식 가이드라인 기반으로 분석하고 JSON으로 평가해주세요.

## 평가 기준 (5개 항목, 총 100점)
1. 쿠팡 가이드라인 준수 (0-25점): 순백색 배경, 워터마크 없음, 85%+ 상품 비율, 1:1 비율
2. 히어로 샷 품질 (0-20점): 촬영 앵글(30도 틸트), 조명, 선명도, 입체감
3. 구도 및 배치 (0-20점): 중앙 정렬, 5-10% 여백, 세트/번들 배치
4. 브랜드 일관성 (0-15점): 톤앤매너, 반복 레이아웃, 브랜드 인식
5. 모바일 클릭 유도력 (0-20점): 모바일 식별성, 차별화, 텍스트 적정

## 응답 형식 (JSON만 출력)
{
  "overallScore": 72,
  "scores": { "guideline": 20, "heroShot": 15, "composition": 16, "branding": 10, "mobile": 11 },
  "issues": [{ "type": "background", "severity": "critical", "message": "배경이 순백색이 아님" }],
  "suggestions": ["배경을 순백색으로 교체"]
}

상품명: {productName}
카테고리: {category}`;

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

  async analyzeWithGeminiVision(
    imageUrl: string,
    productName: string,
    category?: string,
  ): Promise<AiAnalysisResult | null> {
    try {
      const client = this.getClient();
      const originalUrl = this.toCoupangOriginal(imageUrl);
      const { data: imageData, mimeType } = await this.fetchImageAsBase64(originalUrl);

      const prompt = this.ANALYSIS_PROMPT
        .replace('{productName}', productName)
        .replace('{category}', category ?? '미분류');

      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: imageData, mimeType } },
              { text: prompt },
            ],
          },
        ],
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
      };
    } catch (error) {
      this.logger.error(`Gemini Vision 분석 실패: ${error instanceof Error ? error.message : error}`);
      return null;
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
    }

    return {
      overallScore,
      grade: this.scoreToGrade(overallScore),
      scores: null,
      issues,
      suggestions,
      method: 'rule',
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
}
