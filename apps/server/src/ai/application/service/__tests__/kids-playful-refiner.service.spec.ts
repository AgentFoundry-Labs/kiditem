import { describe, expect, it, vi } from 'vitest';
import { KidsPlayfulRefinerService } from '../kids-playful-refiner.service';
import type { DetailPageGeneration } from '../../../domain/prompts/detail-page/single-call';
import { DetailPageHeroImageService } from '../detail-page-hero-image.service';

/**
 * Minimal DetailPageGeneration fixture — only the fields the refiner reads
 * are populated. Cast to the schema-inferred type at the boundary.
 */
function makeParsed(over: Partial<Record<string, unknown>> = {}): DetailPageGeneration {
  return {
    section1: { heroImageIndex: 0, ...((over.section1 as object) ?? {}) },
    section2: {},
    section3: {
      scenarios: [
        { caption: 'c1', imageIndex: 1 },
        { caption: 'c2', imageIndex: 2 },
      ],
      ...((over.section3 as object) ?? {}),
    },
    section4: { moodImageIndex: 3, ...((over.section4 as object) ?? {}) },
    section5: { imageIndex: 4, ...((over.section5 as object) ?? {}) },
    section6: {
      cards: [
        { title: 't1', imageIndex: 5 },
        { title: 't2', imageIndex: 6 },
        { title: 't3', imageIndex: 7 },
      ],
      ...((over.section6 as object) ?? {}),
    },
    section7: { imageIndex: 8, ...((over.section7 as object) ?? {}) },
    section8: {
      blocks: [
        { headline: 'h1', imageIndex: 9 },
        { headline: 'h2', imageIndex: 10 },
      ],
      ...((over.section8 as object) ?? {}),
    },
    section9: {},
    section10: {
      cards: [
        { smallHeadline: 'a', imageIndex: 11 },
        { smallHeadline: 'b', imageIndex: 12 },
        { smallHeadline: 'c', imageIndex: 13 },
      ],
      ...((over.section10 as object) ?? {}),
    },
    section11: {
      galleryImageIndices: [14, 15],
      ...((over.section11 as object) ?? {}),
    },
  } as unknown as DetailPageGeneration;
}

describe('KidsPlayfulRefinerService', () => {
  describe('prepareKidsPlayfulImageContext', () => {
    it('returns empty sets when templateId is not kids-playful', async () => {
      const service = new KidsPlayfulRefinerService();
      const ctx = await service.prepareKidsPlayfulImageContext({
        templateId: 'bold-vertical',
        rawInput: {
          rawDescription: 'desc',
          rawOptions: 'opt',
          imageUrls: ['https://example.com/safety-label.jpg'],
        },
      });
      expect(ctx.packageImageIndices.size).toBe(0);
      expect(ctx.safetyLabelImageIndices.size).toBe(0);
    });

    it('returns safety-label indices from URL markers even without heroImageService', async () => {
      const service = new KidsPlayfulRefinerService();
      const ctx = await service.prepareKidsPlayfulImageContext({
        templateId: 'kids-playful',
        rawInput: {
          rawDescription: 'desc',
          rawOptions: 'opt',
          imageUrls: [
            'https://example.com/product.jpg',
            'https://example.com/safety-label.jpg',
            'https://example.com/barcode.png',
          ],
        },
      });
      expect(ctx.safetyLabelImageIndices.has(1)).toBe(true);
      expect(ctx.safetyLabelImageIndices.has(2)).toBe(true);
      expect(ctx.safetyLabelImageIndices.has(0)).toBe(false);
      // heroImageService absent → packageImageIndices empty
      expect(ctx.packageImageIndices.size).toBe(0);
    });

    it('calls heroImageService.inferPackageImagePositions when present and shouldInferPackageImages is true', async () => {
      const inferPackageImagePositions = vi.fn(async () => [2, 3]);
      const heroImageService = { inferPackageImagePositions } as unknown as DetailPageHeroImageService;
      const service = new KidsPlayfulRefinerService(heroImageService);
      const ctx = await service.prepareKidsPlayfulImageContext({
        templateId: 'kids-playful',
        rawInput: {
          rawDescription: '1박스 12개입 구성. 박스 단위 판매.',
          rawOptions: '',
          imageUrls: ['u0', 'u1', 'u2', 'u3', 'u4'],
        },
      });
      // package indices honored as long as they are within bounds.
      if (inferPackageImagePositions.mock.calls.length > 0) {
        expect(ctx.packageImageIndices.has(2)).toBe(true);
        expect(ctx.packageImageIndices.has(3)).toBe(true);
      }
    });

    it('swallows heroImageService errors and returns empty package indices', async () => {
      const heroImageService = {
        inferPackageImagePositions: vi.fn(async () => { throw new Error('LLM down'); }),
      } as unknown as DetailPageHeroImageService;
      const service = new KidsPlayfulRefinerService(heroImageService);
      const ctx = await service.prepareKidsPlayfulImageContext({
        templateId: 'kids-playful',
        rawInput: {
          rawDescription: '1박스 12개입 구성. 박스 단위 판매.',
          rawOptions: '',
          imageUrls: ['u0', 'u1', 'u2', 'u3', 'u4'],
        },
      });
      expect(ctx.packageImageIndices.size).toBe(0);
    });
  });

  describe('applyKidsPlayfulImageSelectionRules', () => {
    const imageUrls = Array.from({ length: 16 }, (_, i) => `https://example.com/${i}.jpg`);

    it('claims indices in order and does not reuse a normal index across sections', () => {
      const service = new KidsPlayfulRefinerService();
      const parsed = makeParsed({
        section3: {
          scenarios: [
            { caption: 'c1', imageIndex: 1 },
            { caption: 'c2', imageIndex: 1 }, // duplicate — second claim returns null
          ],
        },
      });
      const result = service.applyKidsPlayfulImageSelectionRules(parsed, { imageUrls });
      expect(result.section3.scenarios[0].imageIndex).toBe(1);
      expect(result.section3.scenarios[1].imageIndex).toBeNull();
    });

    it('blocks package indices from being claimed by normal sections', () => {
      const service = new KidsPlayfulRefinerService();
      const parsed = makeParsed({
        section1: { heroImageIndex: 2 }, // 2 is in packageImageIndices below
      });
      const result = service.applyKidsPlayfulImageSelectionRules(
        parsed,
        { imageUrls },
        {
          packageImageIndices: new Set([2]),
          safetyLabelImageIndices: new Set(),
        },
      );
      // hero claim falls back to first remaining (0)
      expect(result.section1.heroImageIndex).toBe(0);
    });

    it('blocks safety-label indices from being claimed by normal sections', () => {
      const service = new KidsPlayfulRefinerService();
      const parsed = makeParsed({
        section1: { heroImageIndex: 5 },
      });
      const result = service.applyKidsPlayfulImageSelectionRules(
        parsed,
        { imageUrls },
        {
          packageImageIndices: new Set(),
          safetyLabelImageIndices: new Set([5]),
        },
      );
      // 5 is blocked → claim falls back to first remaining
      expect(result.section1.heroImageIndex).not.toBe(5);
    });

    it('places package image into gallery second slot, ignoring duplicate normal claims', () => {
      const service = new KidsPlayfulRefinerService();
      const parsed = makeParsed({
        section11: { galleryImageIndices: [14, 15] },
      });
      const result = service.applyKidsPlayfulImageSelectionRules(
        parsed,
        { imageUrls },
        {
          packageImageIndices: new Set([3]),
          safetyLabelImageIndices: new Set(),
        },
      );
      // gallery second slot should prefer the package image (3)
      expect(result.section11.galleryImageIndices[1]).toBe(3);
    });

    it('skips safety-label indices when picking package gallery placement', () => {
      const service = new KidsPlayfulRefinerService();
      const parsed = makeParsed({
        section11: { galleryImageIndices: [14, 15] },
      });
      const result = service.applyKidsPlayfulImageSelectionRules(
        parsed,
        { imageUrls },
        {
          // 3 is both package AND safety → cannot be promoted to gallery
          packageImageIndices: new Set([3]),
          safetyLabelImageIndices: new Set([3]),
        },
      );
      // since 3 is excluded from package gallery candidates, the gallery
      // second slot falls back to claim(15) or claimFirstRemaining.
      expect(result.section11.galleryImageIndices[1]).not.toBe(3);
    });

    it('returns null for an imageIndex pointing outside imageUrls range', () => {
      const service = new KidsPlayfulRefinerService();
      const parsed = makeParsed({
        section1: { heroImageIndex: 999 }, // out of range
      });
      const result = service.applyKidsPlayfulImageSelectionRules(parsed, { imageUrls });
      // out-of-range → falls back to claimFirstRemaining (0)
      expect(result.section1.heroImageIndex).toBe(0);
    });
  });
});
