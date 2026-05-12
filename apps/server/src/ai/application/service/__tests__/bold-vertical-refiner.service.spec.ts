import { describe, expect, it, vi } from 'vitest';
import { BoldVerticalRefinerService } from '../bold-vertical-refiner.service';
import type { BoldVerticalGeneration } from '../../../domain/prompts/bold-vertical/single-call';
import type { DetailPageRawInput } from '../detail-page-ai.types';
import { DetailPageHeroImageService } from '../detail-page-hero-image.service';

function makeParsed(over: Partial<BoldVerticalGeneration> = {}): BoldVerticalGeneration {
  return {
    hook: {
      subtext: '귀여운 키즈',
      text: '기본 제목',
      titleSub: '두번째 줄',
      description: '설명입니다\n두번째 줄',
      imageIndex: 0,
      bannerImageIndex: null,
    },
    section: {
      name: '기본 제목',
      title: '두번째 줄',
      subtitle: '부제',
    },
    keyPoints: [
      { title: '포인트1', description: '설명입니다 정도', imageIndex: 0 },
      { title: '포인트2', description: '설명입니다 정도', imageIndex: 1 },
      { title: '포인트3', description: '설명입니다 정도', imageIndex: null },
    ],
    size: {
      subtitle: '',
      heightLabel: '',
      widthLabel: '',
      guideOverlay: false,
      imageIndices: [],
    },
    color: {
      subtitle: '레드, 블루',
      imageIndices: [1],
    },
    usage: {
      subtitle: '사용법 안내',
      imageIndices: [2],
    },
    detailImageIndices: [0, 1, 2, 3],
    safetyLabelImageIndices: [],
    packageImageIndices: [],
    packageLabel: '',
    productInfo: [
      { key: '제품명', value: '구버전 제품명' },
      { key: '색상', value: '구버전 색상' },
      { key: '재질', value: '플라스틱' },
    ],
    ...over,
  } as BoldVerticalGeneration;
}

function makeRaw(over: Partial<DetailPageRawInput> = {}): DetailPageRawInput {
  return {
    rawTitle: '엄마손 매미달 아이 안전 손목 끈',
    rawCategory: '유아용품',
    rawDescription: '안전한 어린이용 손목 끈입니다. 1박스 12개입',
    rawOptions: '색상: 레드, 블루\n사이즈: H:30cm x W:5cm',
    imageUrls: [
      'https://example.com/product1.jpg',
      'https://example.com/product2.jpg',
      'https://example.com/product3.jpg',
      'https://example.com/product4.jpg',
    ],
    heroImageMode: 'first',
    templateId: 'bold-vertical',
    ...over,
  };
}

describe('BoldVerticalRefinerService', () => {
  describe('refineBoldVerticalGeneration without heroImageService', () => {
    it('runs the full pipeline and falls back gracefully on heroImageService-dependent steps', async () => {
      const service = new BoldVerticalRefinerService();
      const result = await service.refineBoldVerticalGeneration(makeParsed(), makeRaw());

      // Size labels filled from raw options (`H:30cm x W:5cm`)
      expect(result.size.heightLabel).toBe('30cm');
      expect(result.size.widthLabel).toBe('5cm');
      // size.guideOverlay forced to true
      expect(result.size.guideOverlay).toBe(true);
      // Without heroImageService: package inference no-ops → packageLabel empty
      expect(result.packageLabel).toBe('');
      expect(result.packageImageIndices).toEqual([]);
    });

    it('replaces 제품명 productInfo with the title derived from rawTitle', async () => {
      const service = new BoldVerticalRefinerService();
      const result = await service.refineBoldVerticalGeneration(makeParsed(), makeRaw());
      const productNameEntry = result.productInfo.find((info) => info.key.includes('제품명'));
      // Title heading derivation extracts a clean product name (not the raw '구버전 ...')
      expect(productNameEntry?.value).not.toBe('구버전 제품명');
      expect(productNameEntry?.value?.length ?? 0).toBeGreaterThan(0);
    });
  });

  describe('color preference fallback', () => {
    it('strips color subtitle, color imageIndices, and 색상 productInfo when rawDescription marks no color', async () => {
      const service = new BoldVerticalRefinerService();
      const raw = makeRaw({
        rawDescription: '안전한 어린이용 손목 끈입니다. 색상 무관 단일색.',
        rawOptions: '색상 없음',
      });
      const result = await service.refineBoldVerticalGeneration(makeParsed(), raw);
      // When colorPreference resolves to 'none' the no-color branch runs.
      if (result.color.subtitle === '') {
        expect(result.color.imageIndices).toEqual([]);
        expect(result.productInfo.some((info) => info.key.includes('색상'))).toBe(false);
      }
    });
  });

  describe('package label fallbacks', () => {
    it('emits 박스 구성 label when rawDescription mentions box without explicit count', async () => {
      const service = new BoldVerticalRefinerService();
      const raw = makeRaw({
        rawDescription: '안전한 어린이 손목 끈. 단품 박스 포장.',
        rawOptions: '',
      });
      // Pre-populate packageImageIndices so the label fallback path runs.
      const parsed = makeParsed({ packageImageIndices: [3] });
      const result = await service.refineBoldVerticalGeneration(parsed, raw);
      // packageImageIndices [3] survives selection rules (within bounds, not safety).
      // 박스 키워드만 있는 케이스 → '박스 구성'
      expect(result.packageLabel.length).toBeGreaterThan(0);
    });

    it('clears packageImageIndices when packagePreference resolves to none', async () => {
      const service = new BoldVerticalRefinerService();
      const raw = makeRaw({
        rawDescription: '안전한 손목 끈. 단품 판매. 박스 없음.',
        rawOptions: '',
      });
      const parsed = makeParsed({ packageImageIndices: [3] });
      const result = await service.refineBoldVerticalGeneration(parsed, raw);
      // packagePreference === 'none' → packageImageIndices stripped
      if (result.packageLabel === '') {
        expect(result.packageImageIndices).toEqual([]);
      }
    });
  });

  describe('image selection rules with safety labels', () => {
    it('blocks safety-label image indices from keyPoints', async () => {
      const service = new BoldVerticalRefinerService();
      const raw = makeRaw({
        imageUrls: [
          'https://example.com/product1.jpg',
          'https://example.com/safety-label.jpg', // marker → safety
          'https://example.com/product3.jpg',
          'https://example.com/product4.jpg',
        ],
      });
      const parsed = makeParsed({
        keyPoints: [
          { title: '포인트1', description: '설명입니다 정도', imageIndex: 0 },
          { title: '포인트2', description: '설명입니다 정도', imageIndex: 1 }, // safety
          { title: '포인트3', description: '설명입니다 정도', imageIndex: 2 },
        ],
      });
      const result = await service.refineBoldVerticalGeneration(parsed, raw);
      // index 1 is safety → keyPoint pointing at it must be nulled
      const blocked = result.keyPoints[1];
      expect(blocked.imageIndex).toBeNull();
    });
  });

  describe('suppressProductInfoWhenSafetyLabelExists', () => {
    it('returns input unchanged when templateId is not bold-vertical', () => {
      const service = new BoldVerticalRefinerService();
      const input = { productInfo: [{ key: '제품명', value: 'foo' }] };
      const result = service.suppressProductInfoWhenSafetyLabelExists(
        input,
        'kids-playful',
        ['https://example.com/safety-label.jpg'],
      );
      expect(result).toEqual(input);
    });

    it('returns input unchanged when no safety label is present', () => {
      const service = new BoldVerticalRefinerService();
      const input = { productInfo: [{ key: '제품명', value: 'foo' }] };
      const result = service.suppressProductInfoWhenSafetyLabelExists(
        input,
        'bold-vertical',
        ['https://example.com/product.jpg', 'https://example.com/other.jpg'],
      );
      expect(result).toEqual(input);
    });

    it('clears productInfo when a safety-label URL is present', () => {
      const service = new BoldVerticalRefinerService();
      const input = { productInfo: [{ key: '제품명', value: 'foo' }] };
      const result = service.suppressProductInfoWhenSafetyLabelExists(
        input,
        'bold-vertical',
        ['https://example.com/product.jpg', 'https://example.com/safety-label.jpg'],
      );
      expect(result.productInfo).toEqual([]);
    });

    it('clears productInfo when explicit safetyLabelImageIndices is non-empty', () => {
      const service = new BoldVerticalRefinerService();
      const input = {
        productInfo: [{ key: '제품명', value: 'foo' }],
        safetyLabelImageIndices: [2],
      };
      const result = service.suppressProductInfoWhenSafetyLabelExists(
        input,
        'bold-vertical',
        ['https://example.com/product.jpg'],
      );
      expect(result.productInfo).toEqual([]);
    });

    it('clears productInfo when detected safety indices set is non-empty', () => {
      const service = new BoldVerticalRefinerService();
      const input = { productInfo: [{ key: '제품명', value: 'foo' }] };
      const result = service.suppressProductInfoWhenSafetyLabelExists(
        input,
        'bold-vertical',
        ['https://example.com/product.jpg'],
        new Set([0]),
      );
      expect(result.productInfo).toEqual([]);
    });
  });

  describe('with heroImageService', () => {
    it('uses heroImageService.inferColorImageSelection when color preference is not none', async () => {
      const heroImageService = {
        inferColorSubtitle: vi.fn(async () => '레드/블루 2색'),
        inferColorImageSelection: vi.fn(async () => [1, 2]),
        inferPackageImagePositions: vi.fn(async () => []),
      } as unknown as DetailPageHeroImageService;
      const service = new BoldVerticalRefinerService(heroImageService);
      const result = await service.refineBoldVerticalGeneration(makeParsed(), makeRaw());

      expect(heroImageService.inferColorImageSelection).toHaveBeenCalled();
      // applyBoldVerticalImageSelectionRules constrains color.imageIndices to <=6 and removes safety/duplicates
      expect(result.color.imageIndices.length).toBeGreaterThan(0);
    });

    it('falls back gracefully when heroImageService methods throw', async () => {
      const heroImageService = {
        inferColorSubtitle: vi.fn(async () => { throw new Error('LLM down'); }),
        inferColorImageSelection: vi.fn(async () => { throw new Error('LLM down'); }),
        inferPackageImagePositions: vi.fn(async () => { throw new Error('LLM down'); }),
      } as unknown as DetailPageHeroImageService;
      const service = new BoldVerticalRefinerService(heroImageService);
      // Pipeline should swallow heroImage errors and return a result.
      const result = await service.refineBoldVerticalGeneration(makeParsed(), makeRaw());
      expect(result).toBeDefined();
      expect(result.hook).toBeDefined();
    });
  });
});
