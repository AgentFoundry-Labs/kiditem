import type { DetailPageData } from './types';

/** Placeholder data for template preview — no real content, just structure labels. */
export const placeholderDetailPageData: DetailPageData = {
  title: '[상품 이름을 입력하세요]',
  subtitle: '[짧은 소개 문구]',
  description: ['[상품을 설명하는 첫 번째 문장]', '[상품을 설명하는 두 번째 문장]'],
  badge: 'BEST PICK',

  hookText: '[상품 제목 1]',
  hookTitleSub: '[상품 제목 2]',
  hookSubtext: '',

  price: null,
  originalPrice: null,
  discountRate: null,

  images: ['https://placehold.co/860x860/e2e8f0/94a3b8?text=%5B%EC%83%81%ED%92%88+%EC%9D%B4%EB%AF%B8%EC%A7%80%5D'],
  heroBanner: 'https://placehold.co/860x370/e2e8f0/94a3b8?text=%5B%ED%9E%88%EC%96%B4%EB%A1%9C+%EB%B0%B0%EB%84%88%5D',
  sizeImages: ['https://placehold.co/860x500/e2e8f0/94a3b8?text=%5B%EC%82%AC%EC%9D%B4%EC%A6%88+%EC%9D%B4%EB%AF%B8%EC%A7%80%5D'],
  sizeDisplayMode: 'normal',
  colorImages: [],
  colorDisplayMode: 'normal',
  detailImages: ['https://placehold.co/860x600/e2e8f0/94a3b8?text=%5B%EB%94%94%ED%85%8C%EC%9D%BC+%EC%9D%B4%EB%AF%B8%EC%A7%80%5D'],

  keyPoints: [],
  bulletPoints: [],
  features: [],
  specs: [],
  materials: [],
  csInfo: null,

  colorText: '',
  detailText: '[상세 설명을 입력하세요]',
  notes: [],

  sectionName: '[카테고리]',
  sectionTitle: '[섹션 제목]',
  sectionSubtitle: ['[섹션에 대한 설명]'],
  detailTitle: 'DETAIL',
  sizeTitle: '사이즈 안내',
  sizeSubtitle: '정확한 사이즈를 확인해보세요',
  colorTitle: '색상 안내',
  colorSubtitle: '다양한 색상을 확인해보세요',

  themeColorMain: '#ff8c69',
  themeColorBgLight: '#fffaf0',
  themeColorBadge1: '#ff8c69',
  themeColorBadge2: '#69c9ff',
  themeSectionBg: '#f4f1eb',
  themeTextPrimary: '#4a4a4a',
  themeTextSecondary: '#8a8a8a',
  themeBorderRadius: '32px',
  recycleMaterial: '종이',

  productInfo: [
    { key: '제품명', value: '[제품명 입력]' },
    { key: '사이즈', value: '[사이즈 입력]' },
    { key: '재질', value: '[재질 입력]' },
    { key: '원산지', value: '[원산지 입력]' },
    { key: '사용연령', value: '[사용연령 입력]' },
  ],

  faqs: [],
  keywords: [],
  trustBadges: [],
  ctaText: '지금 바로 구매하기',
  ctaSubtext: '',
  layout: null,
  generationMode: 'template',
};
