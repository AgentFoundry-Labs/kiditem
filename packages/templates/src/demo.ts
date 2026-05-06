import type { DetailPageData } from './types';

/**
 * Demo preview data — `super-water-gun-landing-page` reference 11 섹션 매칭.
 * picsum.photos seed-based — deterministic photos.
 */
const photo = (seed: string, w = 1200, h = 800) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const demoDetailPageData: DetailPageData = {
  title: '더블샷 슈퍼워터건',
  subtitle: '여름 물놀이가 완전 달라져요',
  description: [
    '야외 물놀이에서 쏘는 맛, 제대로!',
    '2분사로 승부 끝! 팀전도 꿀잼!',
    '역전까지 노려요',
  ],
  badge: '한정판',

  hookText: '더블샷슈퍼워터건',
  hookTitleSub: '여름 물총 게임!',
  hookSubtext: '',

  price: 24900,
  originalPrice: 39900,
  discountRate: 38,

  images: [photo('water-gun-hero', 1200, 900)],
  heroBanner: photo('water-gun-hero', 1200, 900),
  sizeImages: [],
  sizeDisplayMode: 'normal',
  sizeGuideOverlay: true,
  sizeHeightLabel: '32cm',
  sizeWidthLabel: '18cm',
  colorImages: [photo('water-gun-color-pink-white', 900, 760)],
  colorDisplayMode: 'normal',
  usageImages: [photo('water-gun-usage-steps', 900, 760)],
  usageSubtitle: '사용 전 물통을 채우고 펌프를 당겨 주세요.',
  // 14장 — 각 섹션이 detailImages 인덱스로 사진 가져감
  detailImages: [
    photo('wg-side-1', 1200, 900),       // [0] Reviews lifestyle
    photo('wg-usage-outdoor', 1200, 700), // [1] Usage outdoor
    photo('wg-usage-team', 1200, 700),    // [2] Usage team
    photo('wg-pain', 1200, 700),          // [3] PainPoints fail
    photo('wg-solution', 1200, 1200),     // [4] Solution hero
    photo('wg-feat-1', 600, 600),         // [5] Feature 1 thumb
    photo('wg-feat-2', 600, 600),         // [6] Feature 2 thumb
    photo('wg-feat-3', 600, 600),         // [7] Feature 3 thumb
    photo('wg-key-1', 1200, 1200),        // [8] KeyPoint 1 photo
    photo('wg-blue-1', 1200, 800),        // [9] BlueDetails 1
    photo('wg-blue-2', 1200, 1200),       // [10] BlueDetails 2
    photo('wg-attr-3', 1200, 1200),       // [11] LifestyleAttr 3
    photo('wg-gal-1', 1200, 800),         // [12] Gallery 1
    photo('wg-gal-2', 1200, 700),         // [13] Gallery 2
  ],
  detailPackageImages: [],
  detailPackageLabel: '',
  safetyLabelImages: [],

  keyPoints: [
    {
      number: 1,
      title: '두 개 분사구로\n동시에 더블샷!',
      description: '더블샷슈퍼워터건은 압축펌프 방식!\n기존 물총의 약점 사거리 고민 끝\n더 멀리! 더 강하게 쏴요',
      images: [photo('wg-key-1', 1200, 1200)],
    },
    {
      number: 2,
      title: '압축펌프\n멀리까지 쭉!',
      description: '강력 압축펌프로\n장거리로 시원하게 한 방에!',
      images: [photo('wg-blue-1', 1200, 800)],
    },
    {
      number: 3,
      title: '대용량 물통\n오래 놀아도 든든',
      description: '대용량 물통으로 리필 걱정 줄이고\n더 오래, 더 신나게 즐겨요',
      images: [photo('wg-blue-2', 1200, 1200)],
    },
  ],
  bulletPoints: [],
  features: [
    { icon: '💧', title: '장거리 분사', description: '강력펌프' },
    { icon: '⚡', title: '동시 2발', description: '더블노즐' },
    { icon: '🪣', title: '대용량 물통', description: '오래 사용' },
  ],
  specs: [],
  materials: [
    {
      title: '들고 뛰어도\n가뿐',
      description: '가벼운 무게로',
      image: '',
    },
    {
      title: '한 손으로도\n척척',
      description: '조작은 더 쉽게',
      image: '',
    },
    {
      title: '내구성 탄탄\n오래오래',
      description: '안전한 그립 디자인',
      image: '',
    },
  ],
  csInfo: null,

  colorText: '친구들과 물총 배틀!',
  detailText: '더블샷 물총\n장거리 두발로',
  notes: [
    '물총 사거리 부족...·한방이안닿아',
    '약한 물줄기 논란...·싸움은 늘 지는 쪽',
    '소용량 물통 주의...·물 금방 떨어져요',
  ],

  sectionName: '더블샷슈퍼워터건',
  sectionTitle: '여름 물총 게임!',
  sectionSubtitle: ['이런 점이 다르고', '이래서 더 좋아요'],
  detailTitle: 'DETAIL',
  sizeTitle: '제품 사이즈',
  sizeSubtitle: '실측 기준 ±1cm',
  colorTitle: '색상 안내',
  colorSubtitle: '실제 색상은 다를 수 있습니다',

  themeColorMain: '#1F4FBF',
  themeColorBgLight: '#E5EBFF',
  themeColorBadge1: '#CB1D2A',
  themeColorBadge2: '#1F4FBF',
  themeSectionBg: '#F4EFE8',
  themeTextPrimary: '#0F172A',
  themeTextSecondary: '#475569',
  themeBorderRadius: '24px',
  recycleMaterial: '종이',

  productInfo: [
    { key: '상품명', value: '더블샷슈퍼워터건' },
    { key: '모델명', value: '물총' },
    { key: '구성', value: '대용량워터건 1개' },
    { key: '색상', value: '다양한 컬러' },
    { key: '사이즈', value: '상세페이지 참고' },
    { key: '제조국', value: '대한민국' },
    { key: '판매원', value: '판매원 표기' },
  ],

  faqs: [
    { question: '리뷰 1', answer: '멀리까지 쭉!\n압축펌프라 시원해요' },
    { question: '리뷰 2', answer: '투샷이라 다 패짐!\n친구들이 깜짝 놀라요' },
    { question: '리뷰 3', answer: '대용량이라 오래가요\n물 보충 덜 해서 편해요' },
    { question: '리뷰 4', answer: '가볍고 튼튼해서 굿\n조작도 쉬워요!' },
  ],
  keywords: ['워터건', '여름장난감', '물놀이', '키즈워터건', '워터건추천'],
  trustBadges: [],
  ctaText: '지금 바로 구매하기',
  ctaSubtext: '오늘 주문 시 내일 도착',
  layout: null,
  generationMode: 'template',
};
