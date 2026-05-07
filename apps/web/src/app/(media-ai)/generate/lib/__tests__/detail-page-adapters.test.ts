import { describe, expect, it } from 'vitest';
import { adaptBoldVerticalToDetailPageData } from '../bold-vertical-types';
import { adaptToKidsPlayful, type DetailPageGenerationRaw } from '../kids-playful-types';

const SAFETY_URL = 'https://cdn.example.com/detail-page-inputs/org/safety-label-kc.jpg';

describe('detail page generation adapters', () => {
  it('renders safety label images in the bold vertical footer instead of normal image sections', () => {
    const data = adaptBoldVerticalToDetailPageData(
      {
        hook: {
          subtext: '이달의 추천',
          text: '비눗방울',
          titleSub: '즐거운 놀이',
          description: '아이와 함께 즐기는 놀이',
          imageIndex: 1,
          bannerImageIndex: null,
        },
        section: {
          name: '놀이 포인트',
          title: '핵심 장점',
          subtitle: '가볍게 즐기는 실내놀이',
        },
        keyPoints: [
          { title: '쉬운 사용', description: '아이도 쉽게 다룰 수 있어요', imageIndex: 0 },
          { title: '가벼운 무게', description: '들고 놀기 부담이 없어요', imageIndex: 1 },
          { title: '선물 추천', description: '특별한 날 선물로 좋아요', imageIndex: 0 },
        ],
        size: { subtitle: '', imageIndices: [] },
        color: { subtitle: '', imageIndices: [] },
        usage: { subtitle: '', imageIndices: [] },
        detailImageIndices: [0, 1],
        productInfo: [{ key: '제품명', value: '비눗방울' }],
      },
      ['https://cdn.example.com/product.jpg', SAFETY_URL],
    );

    expect(data.safetyLabelImages).toEqual([SAFETY_URL]);
    expect(data.productInfo).toEqual([]);
    expect(data.detailImages).toEqual(['https://cdn.example.com/product.jpg']);
    expect(data.images).toEqual([]);
    expect(data.keyPoints?.[1]?.images).toEqual([]);
  });

  it('keeps safety label images at the end of kids playful footer data', () => {
    const data = adaptToKidsPlayful(
      makeKidsRaw(),
      ['https://cdn.example.com/product.jpg', SAFETY_URL],
    );

    expect(data.safetyLabelImageUrls).toEqual([SAFETY_URL]);
    expect(data.section1.heroImageUrl).toBeNull();
    expect(data.section11.galleryImageUrls).toEqual(['https://cdn.example.com/product.jpg', null]);
  });

  it('uses generated hero banner before raw hero images', () => {
    const generatedHero = 'https://cdn.example.com/generated-hero.png';
    const bold = adaptBoldVerticalToDetailPageData(
      {
        hook: {
          subtext: '이달의 추천',
          text: '비눗방울',
          titleSub: '즐거운 놀이',
          description: '아이와 함께 즐기는 놀이',
          imageIndex: 0,
          bannerImageIndex: 0,
        },
        section: { name: '', title: '', subtitle: '' },
        keyPoints: [
          { title: '쉬운 사용', description: '아이도 쉽게 다룰 수 있어요', imageIndex: 0 },
          { title: '가벼운 무게', description: '들고 놀기 부담이 없어요', imageIndex: 0 },
          { title: '선물 추천', description: '특별한 날 선물로 좋아요', imageIndex: 0 },
        ],
        size: { subtitle: '', imageIndices: [] },
        color: { subtitle: '', imageIndices: [] },
        usage: { subtitle: '', imageIndices: [] },
        detailImageIndices: [],
        productInfo: [],
      },
      ['https://cdn.example.com/product.jpg'],
      { __heroBanner: generatedHero },
    );
    const kids = adaptToKidsPlayful(
      makeKidsRaw(),
      ['https://cdn.example.com/product.jpg'],
      { __heroBanner: generatedHero },
    );

    expect(bold.heroBanner).toBe(generatedHero);
    expect(bold.images).toEqual(['https://cdn.example.com/product.jpg']);
    expect(kids.section1.heroImageUrl).toBe(generatedHero);
  });

  it('maps bold vertical size guide labels and falls back to a standalone product image', () => {
    const data = adaptBoldVerticalToDetailPageData(
      {
        hook: {
          subtext: '이달의 추천',
          text: '목걸이 비눗방울',
          titleSub: '버블 파티',
          description: '어디서든 가볍게 즐기는 비눗방울',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '제품 정보', subtitle: '' },
        keyPoints: [
          { title: '휴대 간편', description: '목에 걸고 다닐 수 있어요', imageIndex: 0 },
          { title: '자동 버블', description: '버튼 하나로 즐길 수 있어요', imageIndex: 0 },
          { title: '선물 추천', description: '파티 선물로 잘 어울려요', imageIndex: 0 },
        ],
        size: {
          subtitle: '목걸이 비눗방울의 사이즈 안내 입니다.',
          heightLabel: '80mm',
          widthLabel: '45mm',
          guideOverlay: true,
          imageIndices: [],
        },
        color: { subtitle: '', imageIndices: [] },
        usage: { subtitle: '버튼을 눌러 작동해 주세요.', imageIndices: [1] },
        detailImageIndices: [],
        productInfo: [],
      },
      ['https://cdn.example.com/bubble-group.jpg', 'https://cdn.example.com/bubble-single.jpg'],
      { __sizeGuideImage: '/generated/size-cutout.png' },
      'https://api.example.com',
    );

    expect(data.images).toEqual(['https://cdn.example.com/bubble-group.jpg']);
    expect(data.sectionSubtitle).toEqual([
      '목걸이 비눗방울 버블 파티의 상품정보 입니다.',
      '아래의 제품정보를 확인해 주세요.',
    ]);
    expect(data.detailText).toBe('구성품 및 색상은 사진과 다를 수 있습니다');
    expect(data.sizeTitle).toBe('제품 사이즈 및 구성품');
    expect(data.sizeSubtitle).toBe('목걸이 비눗방울 버블 파티의 사이즈 및 구성품 안내 입니다.');
    expect(data.sizeHeightLabel).toBe('80mm');
    expect(data.sizeWidthLabel).toBe('45mm');
    expect(data.sizeGuideOverlay).toBe(true);
    expect(data.sizeImages).toEqual(['https://api.example.com/generated/size-cutout.png']);
    expect(data.usageSubtitle).toBe('버튼을 눌러 작동해 주세요.');
    expect(data.usageImages).toEqual(['https://cdn.example.com/bubble-single.jpg']);
  });

  it('routes generated bold vertical section images into their matching sections', () => {
    const data = adaptBoldVerticalToDetailPageData(
      {
        hook: {
          subtext: '이달의 추천',
          text: '목걸이 비눗방울',
          titleSub: '버블 파티',
          description: '어디서든 가볍게 즐기는 비눗방울',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '제품 정보', subtitle: '' },
        keyPoints: [
          { title: '휴대 간편', description: '목에 걸고 다닐 수 있어요', imageIndex: 0 },
          { title: '자동 버블', description: '버튼 하나로 즐길 수 있어요', imageIndex: 0 },
          { title: '선물 추천', description: '파티 선물로 잘 어울려요', imageIndex: 0 },
        ],
        size: { subtitle: '', heightLabel: '', widthLabel: '', guideOverlay: true, imageIndices: [0] },
        color: { subtitle: '그린 / 핑크 / 옐로우 3 색상', imageIndices: [1] },
        usage: { subtitle: '', imageIndices: [] },
        detailImageIndices: [0],
        productInfo: [],
      },
      ['https://cdn.example.com/product-main.jpg', 'https://cdn.example.com/color-row.jpg'],
      {
        __colorGuideImage: '/generated/color-guide.png',
        __detailImage1: '/generated/detail-1.png',
        __detailImage2: '/generated/detail-2.png',
      },
      'https://api.example.com',
    );

    expect(data.colorImages).toEqual(['https://api.example.com/generated/color-guide.png']);
    expect(data.detailImages).toEqual([
      'https://api.example.com/generated/detail-1.png',
      'https://api.example.com/generated/detail-2.png',
      'https://cdn.example.com/product-main.jpg',
    ]);
  });
});

function makeKidsRaw(): DetailPageGenerationRaw {
  return {
    section1: {
      subhead: '이달의 추천',
      mainHeadline: '비눗방울 놀이',
      heroImageIndex: 1,
    },
    section2: { reviews: [] },
    section3: { label: '', headline: '', subhead: '', scenarios: [] },
    section4: {
      intro: { line1: '', line2: '', line3: '' },
      cards: [],
      moodImageIndex: null,
    },
    section5: {
      headlineLine1: '',
      headlineLine2: '',
      subcopy: ['', '', ''],
      imageIndex: null,
    },
    section6: { label: '', headline: '', bigHeadline: '', cards: [] },
    section7: {
      tagText: 'KeyPoint',
      headlineLine1: '',
      headlineLine2: '',
      emphasisInLine2: '',
      body1: '',
      body2: '',
      bodyEmphasis: '',
      imageIndex: null,
    },
    section8: {
      introLine1: '',
      introLine2: '',
      introLine3: '',
      blocks: [],
    },
    section9: {
      tagText: 'KeyPoint',
      smallHeadline: '',
      bigHeadline: { line1: '', line2: '', line3: '' },
      emphasisInLine3: '',
      body: ['', ''],
      topic: '',
    },
    section10: { cards: [] },
    section11: {
      galleryImageIndices: [0, 1],
      symbolCard: { icon: 'Sparkles', text: '' },
      closing: { body: ['', ''], headline: ['', ''] },
    },
  };
}
