import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');
import type { ComplianceScores } from '@kiditem/shared/ai';
import { ThumbnailVisionAiService } from '../services/thumbnail-vision-ai.service';

type RawCompliance = {
  violations?: Partial<ComplianceScores['violations']>;
  confidence?: Record<string, number | string>;
  reasons?: Record<string, string>;
  quality?: Record<string, unknown>;
};

async function makePngBase64(background: { r: number; g: number; b: number }) {
  const buffer = await sharp({
    create: {
      width: 1200,
      height: 1200,
      channels: 3,
      background,
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 520,
            height: 520,
            channels: 3,
            background: { r: 80, g: 110, b: 180 },
          },
        })
          .png()
          .toBuffer(),
        left: 340,
        top: 340,
      },
    ])
    .png()
    .toBuffer();
  return { data: buffer.toString('base64'), mimeType: 'image/png' };
}

function makeService(): ThumbnailVisionAiService {
  // The compliance helpers under test do not touch the injected services, so
  // null casts are sufficient for unit-level coverage.
  return new ThumbnailVisionAiService(null as never, null as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_IMAGE_ANALYSIS_MODEL;
  delete process.env.AI_IMAGE_ANALYSIS_VERIFY_MODEL;
});

describe('ThumbnailVisionAiService compliance helpers', () => {
  it('keeps confirmed colored backgrounds non-compliant via pixel mask', async () => {
    const service = makeService();
    // Background (242, 247, 252): bright enough to be a bg candidate
    // (minc>=230, maxc-minc<12) so flood-fill expands across the frame, but
    // the blueish tint and channel spread keep it out of the strict
    // white verdict (requires minChannelMean>=248 and maxChannelDiff<3).
    const verdict = await (service as any).analyzeWhiteBackgroundByPixels(
      await makePngBase64({ r: 242, g: 247, b: 252 }),
    );
    expect(verdict.verdict).toBe('not-white');
  });

  it('marks pure-white backgrounds as compliant via pixel mask', async () => {
    const service = makeService();
    const verdict = await (service as any).analyzeWhiteBackgroundByPixels(
      await makePngBase64({ r: 255, g: 255, b: 255 }),
    );
    expect(verdict.verdict).toBe('white');
  });

  it('treats package surface text as physical, flipping has_text to false', () => {
    const service = makeService();
    const raw: RawCompliance = {
      violations: { has_text: true, has_discount_text: true },
      confidence: { has_text: 91, has_discount_text: 88 },
      reasons: {
        has_text: '박스 라벨 표면에 제품명이 인쇄되어 있음',
        has_discount_text: '패키지에 1+1 증정 문구가 인쇄됨',
      },
    };
    (service as any).normalizeTextRelatedViolations(raw);
    expect(raw.violations?.has_text).toBe(false);
    expect(raw.violations?.has_discount_text).toBe(false);
    expect(raw.reasons?.has_text).toBeUndefined();
    expect(raw.reasons?.has_discount_text).toBeUndefined();
  });

  it('keeps explicit digital overlay evidence as a violation', () => {
    const service = makeService();
    const raw: RawCompliance = {
      violations: { has_discount_text: true },
      confidence: { has_discount_text: 82 },
      reasons: {
        has_discount_text: "우상단 여백에 포토샵 오버레이 '30% 할인' 배지",
      },
    };
    (service as any).normalizeTextRelatedViolations(raw);
    expect(raw.violations?.has_discount_text).toBe(true);
    expect(raw.reasons?.has_discount_text).toContain('오버레이');
  });

  it('rejects vague digital claims when reason cites package surface', () => {
    const service = makeService();
    expect(
      (service as any).hasDigitalOverlayEvidence('패키지 전면 라벨 표면의 30% 할인 인쇄 문구'),
    ).toBe(false);
    expect(
      (service as any).hasDigitalOverlayEvidence("우상단 여백에 포토샵 오버레이 '30% 할인' 배지"),
    ).toBe(true);
    expect(
      (service as any).hasDigitalOverlayEvidence('상품 표면과 분리되어 떠 있는 디지털 오버레이'),
    ).toBe(true);
  });

  it('normalizes Gemini string booleans and clamps confidence values before grading', () => {
    const service = makeService();
    const result = (service as any).parseComplianceResponse({
      violations: {
        background_not_white: 'false',
        has_overlay_effects: 'true',
      },
      confidence: {
        has_overlay_effects: '140',
        background_not_white: '-5',
      },
      reasons: {
        has_overlay_effects: '좌측 상단에 그래픽 리본 오버레이',
        background_not_white: '문자열 false reason 은 제거되어야 함',
      },
      quality: {
        estimatedFillPercent: '101',
        centerOffsetPercent: '-2',
        aspectRatioValid: 'true',
      },
    });
    expect(result.complianceGrade).toBe('FAIL');
    expect(result.complianceScores.violations.background_not_white).toBe(false);
    expect(result.complianceScores.violations.has_overlay_effects).toBe(true);
    expect(result.complianceScores.confidence.has_overlay_effects).toBe(100);
    expect(result.complianceScores.confidence.background_not_white).toBe(0);
    expect(result.complianceScores.reasons?.background_not_white).toBeUndefined();
    expect(result.complianceScores.quality.estimatedFillPercent).toBe(100);
    expect(result.complianceScores.quality.centerOffsetPercent).toBe(0);
    expect(result.complianceScores.quality.aspectRatioValid).toBe(true);
  });

  it('does not fail compliance when Gemini omits violation keys', () => {
    const service = makeService();
    const result = (service as any).parseComplianceResponse({
      quality: { estimatedFillPercent: 90, centerOffsetPercent: 2, aspectRatioValid: true },
    });
    expect(result.complianceGrade).toBe('PASS');
    expect(result.complianceScores.violationCount).toBe(0);
  });
});

describe('ThumbnailVisionAiService failure and fetch behavior', () => {
  it('propagates Gemini configuration failures instead of returning an empty quality map', async () => {
    const service = new ThumbnailVisionAiService(
      { fetchTrustedStorageImage: vi.fn() } as never,
      { complianceParts: vi.fn(() => []) } as never,
    );

    await expect(
      service.analyzeQuality([
        {
          productId: 'p1',
          productName: 'Product',
          imageUrl: 'https://example.com/p.jpg',
          category: null,
        },
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propagates pre-aborted quality analysis instead of returning an empty map', async () => {
    const imageFetcher = { fetchTrustedStorageImage: vi.fn() };
    const service = new ThumbnailVisionAiService(
      imageFetcher as never,
      { complianceParts: vi.fn(() => []) } as never,
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      service.analyzeQuality(
        [
          {
            productId: 'p1',
            productName: 'Product',
            imageUrl: 'https://example.com/p.jpg',
            category: null,
          },
        ],
        controller.signal,
      ),
    ).rejects.toThrow('ABORTED');
    expect(imageFetcher.fetchTrustedStorageImage).not.toHaveBeenCalled();
  });

  it('propagates second-pass Gemini model configuration failures in compliance checks', async () => {
    process.env.AI_IMAGE_ANALYSIS_MODEL = 'gemini-test';
    const imageFetcher = {
      fetchTrustedStorageImage: vi.fn(async () => ({
        buffer: Buffer.from('image-bytes'),
        mimeType: 'image/jpeg',
      })),
    };
    const service = new ThumbnailVisionAiService(
      imageFetcher as never,
      { complianceParts: vi.fn(() => []) } as never,
    );
    (service as any).client = {
      models: {
        generateContent: vi.fn(async () => ({
          text: JSON.stringify([
            {
              index: 0,
              violations: { has_text: true },
              confidence: { has_text: 95 },
              reasons: { has_text: '우상단 여백에 디지털 오버레이 텍스트' },
              quality: { estimatedFillPercent: 90, centerOffsetPercent: 1, aspectRatioValid: true },
            },
          ]),
        })),
      },
    };

    await expect(
      service.checkCompliance([
        {
          productId: 'p1',
          productName: 'Product',
          imageUrl: 'https://example.com/p.jpg',
          category: null,
        },
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses trusted storage fetches for image spec probing', async () => {
    const buffer = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    const imageFetcher = {
      fetchTrustedStorageImage: vi.fn(async () => ({
        buffer,
        mimeType: 'image/jpeg',
        storageKey: 'thumbnail-inputs/p.jpg',
      })),
    };
    const service = new ThumbnailVisionAiService(
      imageFetcher as never,
      { complianceParts: vi.fn(() => []) } as never,
    );

    await service.checkImageSpec('http://localhost:9000/kiditem/thumbnail-inputs/p.jpg');

    expect(imageFetcher.fetchTrustedStorageImage).toHaveBeenCalledWith(
      'http://localhost:9000/kiditem/thumbnail-inputs/p.jpg',
    );
  });
});
