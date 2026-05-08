import { describe, expect, it } from 'vitest';
import { adaptBoldVerticalToDetailPageData } from '../bold-vertical-types';
import { adaptToKidsPlayful, type DetailPageGenerationRaw } from '../kids-playful-types';

const SAFETY_URL = 'https://cdn.example.com/detail-page-inputs/org/safety-label-kc.jpg';

describe('detail page generation adapters', () => {
  it('renders safety label images in the bold vertical footer instead of normal image sections', () => {
    const PLAIN_BARCODE_URL = 'https://cdn.example.com/raw/image-7.jpg';
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
        detailImageIndices: [0, 1, 2],
        safetyLabelImageIndices: [1],
        productInfo: [{ key: '제품명', value: '비눗방울' }],
      },
      ['https://cdn.example.com/product.jpg', SAFETY_URL, PLAIN_BARCODE_URL],
    );

    expect(data.safetyLabelImages).toEqual([PLAIN_BARCODE_URL, SAFETY_URL]);
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

  it('routes generated kids playful section images into empty image slots', () => {
    const data = adaptToKidsPlayful(
      {
        ...makeKidsRaw(),
        section3: {
          label: '촉감놀이 200%',
          headline: '손끝 놀이 친구',
          subhead: '오감으로 즐기는 시간',
          scenarios: [
            { caption: '포장을 열고 준비하세요', imageIndex: null },
            { caption: '손으로 주무르며 놀아요', imageIndex: null },
          ],
        },
        section5: {
          headlineLine1: '손끝으로',
          headlineLine2: '즐겨요',
          subcopy: ['말랑한 촉감', '바삭한 소리', '색상 재미'],
          imageIndex: null,
        },
        section6: {
          label: '왁스팝 특징',
          headline: '손으로 느끼는 재미',
          bigHeadline: '오감발달',
          cards: [
            { num: '01', title: '말랑촉감', subtitle: '손끝자극', imageIndex: null },
            { num: '02', title: '바삭소리', subtitle: '놀이몰입', imageIndex: null },
            { num: '03', title: '색상구성', subtitle: '랜덤재미', imageIndex: null },
          ],
        },
        section7: {
          ...makeKidsRaw().section7,
          imageIndex: null,
        },
        section8: {
          introLine1: '바삭한 소리와 촉감',
          introLine2: '오감발달 놀이시간',
          introLine3: '수제왁스팝',
          blocks: [
            { pillLabel: '01. 소리', headline: '바삭하게', body: '누를수록 재미있어요', imageIndex: null },
            { pillLabel: '02. 촉감', headline: '말랑하게', body: '손끝으로 느껴요', imageIndex: null },
          ],
        },
        section10: {
          cards: [
            { smallHeadline: '실내놀이', bigHeadlineLine1: '집에서도', bigHeadlineLine2: 'OK', imageIndex: null },
            { smallHeadline: '선물추천', bigHeadlineLine1: '아이들이', bigHeadlineLine2: '좋아해', imageIndex: null },
          ],
        },
      },
      ['https://cdn.example.com/product.jpg'],
      {
        __usageGuideImage1: '/generated/usage-guide-1.png',
        __usageGuideImage2: '/generated/usage-guide-2.png',
        __detailImage1: '/generated/detail-1.png',
        __detailImage2: '/generated/detail-2.png',
        __detailImage3: '/generated/detail-3.png',
      },
      'https://api.example.com',
    );

    expect(data.section3.scenarios[0]?.imageUrl).toBe('https://api.example.com/generated/usage-guide-1.png');
    expect(data.section3.scenarios[1]?.imageUrl).toBe('https://api.example.com/generated/usage-guide-2.png');
    expect(data.section5.imageUrl).toBe('https://api.example.com/generated/detail-1.png');
    expect(data.section6.cards[1]?.imageUrl).toBe('https://api.example.com/generated/detail-2.png');
    expect(data.section8.blocks[0]?.imageUrl).toBe('https://api.example.com/generated/detail-2.png');
    expect(data.section10.cards[0]?.imageUrl).toBe('https://api.example.com/generated/usage-guide-1.png');
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

    expect(data.images).toEqual(['https://api.example.com/generated/size-cutout.png']);
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
    expect(data.usageSubtitle).toBe([
      '1. 버튼을 눌러 작동해 주세요.',
      '2. 제품을 세워 잡고 전원을 켜세요',
      '3. 입구가 얼굴을 향하지 않게 사용하세요',
    ].join('\n'));
    expect(data.usageImages).toEqual(['https://cdn.example.com/bubble-single.jpg']);
  });

  it('keeps the DETAIL section visible when no dedicated detail image exists', () => {
    const data = adaptBoldVerticalToDetailPageData(
      {
        hook: {
          subtext: '이달의 추천',
          text: '촉감놀이',
          titleSub: '수제 왁스팝',
          description: '손으로 누르며 즐기는 촉감 놀이',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '촉감놀이', title: '수제 왁스팝', subtitle: '' },
        keyPoints: [
          { title: '말랑한 촉감', description: '손끝으로 느끼는 말랑함', imageIndex: 0 },
          { title: '간편 사용', description: '꺼내서 바로 즐기는 놀이', imageIndex: 0 },
          { title: '보관 쉬움', description: '사용 후 정리하기 간편', imageIndex: 0 },
        ],
        size: { subtitle: '', imageIndices: [] },
        color: { subtitle: '', imageIndices: [] },
        usage: { subtitle: '', imageIndices: [] },
        detailImageIndices: [],
        productInfo: [],
      },
      ['https://cdn.example.com/product-main.jpg'],
    );

    expect(data.detailImages).toEqual(['https://cdn.example.com/product-main.jpg']);
    expect(data.usageSubtitle).toContain('1. 포장을 열고 제품 상태를 확인하세요');
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
        __usageGuideImage1: '/generated/usage-guide-1.png',
        __usageGuideImage2: '/generated/usage-guide-2.png',
        __detailImage1: '/generated/detail-1.png',
        __detailImage2: '/generated/detail-2.png',
      },
      'https://api.example.com',
    );

    expect(data.colorImages).toEqual(['https://api.example.com/generated/color-guide.png']);
    expect(data.usageImages).toEqual([
      'https://api.example.com/generated/usage-guide-1.png',
      'https://api.example.com/generated/usage-guide-2.png',
    ]);
    expect(data.detailImages).toEqual([
      'https://api.example.com/generated/detail-1.png',
      'https://api.example.com/generated/detail-2.png',
      'https://cdn.example.com/product-main.jpg',
    ]);
  });

  it('keeps package images in one package block instead of mixing them into normal DETAIL images', () => {
    const data = adaptBoldVerticalToDetailPageData(
      {
        hook: {
          subtext: '이달의 추천',
          text: '바삭바삭수제',
          titleSub: '왁스팝',
          description: '손으로 누르며 즐기는 촉감 놀이',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '제품 정보', subtitle: '' },
        keyPoints: [
          { title: '말랑한 촉감', description: '손끝으로 느끼는 말랑함', imageIndex: 0 },
          { title: '귀여운 디자인', description: '색상별로 즐길 수 있어요', imageIndex: 1 },
          { title: '구성 확인', description: '박스 구성을 확인하세요', imageIndex: 2 },
        ],
        size: { subtitle: '', heightLabel: '', widthLabel: '', guideOverlay: true, imageIndices: [] },
        color: { subtitle: '', imageIndices: [] },
        usage: { subtitle: '포장을 열고 제품을 확인하세요', imageIndices: [1] },
        detailImageIndices: [0, 2, 1],
        packageImageIndices: [1, 2],
        packageLabel: '1박스 9개입 구성',
        productInfo: [],
      },
      [
        'https://cdn.example.com/product-main.jpg',
        'https://cdn.example.com/texture-closeup.jpg',
        'https://cdn.example.com/retail-box.jpg',
      ],
    );

    expect(data.detailImages).toEqual([
      'https://cdn.example.com/product-main.jpg',
      'https://cdn.example.com/texture-closeup.jpg',
    ]);
    expect(data.detailPackageImages).toEqual(['https://cdn.example.com/retail-box.jpg']);
    expect(data.detailPackageLabel).toBe('1박스 9개입 구성');
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
