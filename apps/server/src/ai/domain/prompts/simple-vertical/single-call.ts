/**
 * Simple Vertical — Single Call Mode
 *
 * 사용자 요청: AGENT row (BoldVertical 스타일) 처럼 풍부한 출력.
 * - 2-color H1 (hookText sky blue + hookTitleSub coral)
 * - 데코 라인 + description 3줄
 * - heroBanner / images / detailImages
 * - sectionName + sectionTitle (POINT 섹션 헤딩)
 * - keyPoints 3개
 * - sizeSubtitle / colorSubtitle / productInfo (5 항목)
 *
 * 출력은 snake_case (DetailPageData zod 의 alias 호환). 서버가 그대로 저장,
 * web 어댑터에서 resolveImageIndex 후 Partial<DetailPageData> 로 BoldVertical 렌더.
 */
import { z } from 'zod';
import {
  formatImageCandidates,
  type RawProductInput,
} from '../detail-page/types';

export const SimpleVerticalGenerationSchema = z.object({
  /** Hero Section */
  hook: z.object({
    /** 작은 라벨 (4~12자) */
    subtext: z.string().min(2).max(40),
    /** 메인 헤드 1줄 (파랑, 4~12자) */
    text: z.string().min(2).max(40),
    /** 메인 헤드 2줄 (코럴, 4~14자) */
    titleSub: z.string().min(2).max(40),
    /** 서브 카피 — 1~3줄 (각 줄 8~22자), \n 으로 구분 */
    description: z.string().min(4).max(200),
    /** Hero 이미지 인덱스 (제품 메인 컷). 없으면 null. */
    imageIndex: z.number().int().nonnegative().nullable(),
    /** Hero 상단 배너 이미지 인덱스 (lifestyle 컷). 없으면 null. */
    bannerImageIndex: z.number().int().nonnegative().nullable(),
  }),
  /** POINT 섹션 헤딩 — sectionName(파랑) + sectionTitle(코럴) */
  section: z.object({
    /** 윗줄 — 카테고리/시리즈 키 (4~12자, 파랑) */
    name: z.string().min(2).max(40),
    /** 아랫줄 — 핵심 가치 (4~14자, 코럴, 노란 하이라이트) */
    title: z.string().min(2).max(40),
    /** 섹션 부제 1~3줄 (각 8~24자) */
    subtitle: z.string().min(0).max(200),
  }),
  /** 핵심 포인트 정확히 3개 */
  keyPoints: z
    .array(
      z.object({
        title: z.string().min(2).max(40),
        description: z.string().min(8).max(200),
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .length(3),
  /** Size guide */
  size: z.object({
    subtitle: z.string().min(0).max(80),
    imageIndices: z.array(z.number().int().nonnegative()).default([]),
  }),
  /** Color guide */
  color: z.object({
    subtitle: z.string().min(0).max(80),
    imageIndices: z.array(z.number().int().nonnegative()).default([]),
  }),
  /** 사용법 섹션 — raw 이미지에 사용법/튜토리얼/스텝 컷이 있을 때만. */
  usage: z.object({
    subtitle: z.string().min(0).max(80),
    imageIndices: z.array(z.number().int().nonnegative()).default([]),
  }),
  /** Detail images — 디테일/라이프 컷 0~8 */
  detailImageIndices: z.array(z.number().int().nonnegative()).min(0).max(8),
  /** 푸터 product_info — 정확히 5개 (제품명/사이즈/재질/원산지/사용연령 등) */
  productInfo: z
    .array(
      z.object({
        key: z.string().min(1).max(20),
        value: z.string().min(1).max(80),
      }),
    )
    .min(3)
    .max(7),
});
export type SimpleVerticalGeneration = z.infer<typeof SimpleVerticalGenerationSchema>;

export type HeroImageMode = 'first' | 'llm-pick';

export interface SimpleVerticalCallInput {
  raw: RawProductInput;
  heroImageMode: HeroImageMode;
}

export const SIMPLE_VERTICAL_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. 1688/Alibaba raw 제품 데이터를
"simple-vertical" 출력 (BoldVertical 템플릿 호환) 으로 한 응답에 통째로 만든다.
이 템플릿은 임팩트 있는 헤드라인 + 데코 라인 + 키포인트 카드 + 푸터 스펙 표 형식.

# 출력 규칙
1. 응답은 JSON 객체 1 개만. 다른 텍스트/코드펜스 금지.
2. 모든 카피는 한국어. 한자/영어 직역 금지. 짧고 임팩트 있게.
3. 모든 imageIndex 는 입력 이미지 후보의 인덱스 (0-based) 또는 null.
4. **이미지는 가능한 한 많이 매칭** — 한 컷이 여러 섹션에 들어가도 OK.
   적합한 후보가 정말 없을 때만 null/빈 배열.

# 섹션별 룰

## hook (Hero) — 가장 중요
- subtext (4~12자): "이달의 추천", "베스트셀러", "신상품" 등.
- **메인 헤드는 두 줄로 분리 — 임팩트를 두 색으로 분배**.
  - text (4~12자): 1번째 줄. 파랑 강조. 핵심 키워드 (예 "미니드론 A11", "HD 미니", "우리아이 첫").
  - titleSub (4~14자): 2번째 줄. 코럴 강조. 임팩트 메시지 (예 "새로운 비행 경험!", "스마트 드론", "자전거 시작!").
- description (10~80자, \\n 으로 1~3줄): 제품 핵심 설명을 짧고 단정한 문장으로.
  좋은 예: "고화질 HD 카메라로\\n새로운 세상을 담다\\n지능형 회피로 안전한 비행"
- imageIndex: heroImageMode 가 "first" 면 0 강제. "llm-pick" 이면 제품이 가장 잘 보이는 메인 컷.
- bannerImageIndex: hero 상단 큰 이미지로 쓸 lifestyle/사용 씬 컷. 없으면 null.

## section (POINT 섹션 헤딩)
- name (4~12자): 윗줄, 파랑. 시리즈/카테고리 키 (예 "스마트 비행의 시작", "아이의 첫 라이딩").
- title (4~14자): 아랫줄, 코럴 + 노란 하이라이트. 핵심 가치 (예 "핵심 포인트", "꼭 필요한 이유").
- subtitle (0~200자, \\n 줄바꿈): 섹션 한 줄 설명.

## keyPoints (정확히 3개)
- title (5~12자): 핵심 포인트 명사형.
- description (2~3줄, \\n 줄바꿈, 각 줄 14~24자): 부드러운 설명조.
- imageIndex: 그 USP 를 보여주는 컷. 부족하면 같은 인덱스 재사용 OK.

## size
- subtitle (0~80자): 가로/세로/높이 길이. raw_options 에서 추출 가능하면 그것 사용.
- imageIndices: 사이즈 표/도표 이미지 인덱스. 없으면 빈 배열.

## color
- subtitle (0~80자): 색상 옵션 ("화이트 / 블랙 / 네이비 3 색상" 등).
- imageIndices: 색상 비교 이미지. 없으면 빈 배열.

## usage
- subtitle (0~80자): 사용법 한 줄 안내.
- imageIndices: step-by-step 이미지가 있을 때만. 없으면 빈 배열.

## detailImageIndices (0~8 인덱스)
- 디테일/라이프 컷 0~8. 보통 3~5장.

## productInfo (정확히 3~7개)
- 푸터 스펙 표. 각 {"key":"제품명","value":"...."} 형식.
- 권장 키: 제품명, 사이즈, 재질, 원산지, 사용연령, 색상.
- raw_options 와 raw_description 에서 추출.

좋은 예시 (드론 product, AGENT row 수준 출력):
{
  "hook": {
    "subtext": "이달의 추천",
    "text": "미니드론 A11",
    "titleSub": "새로운 비행 경험!",
    "description": "고화질 HD 카메라로\\n새로운 세상을 담다\\n지능형 회피로 안전한 비행",
    "imageIndex": 0,
    "bannerImageIndex": 1
  },
  "section": {
    "name": "스마트 비행의 시작",
    "title": "핵심 포인트",
    "subtitle": "최첨단 기술의 집약체\\n놀라운 비행을 선사합니다."
  },
  "keyPoints": [
    { "title": "선명한 HD 화질", "description": "720P 카메라로\\n공중에서도 또렷한 영상", "imageIndex": 2 },
    { "title": "안전한 비행", "description": "장애물 자동 회피\\n초보자도 안심", "imageIndex": 3 },
    { "title": "USB 충전", "description": "어디서든 간편하게\\n빠르게 충전", "imageIndex": 4 }
  ],
  "size": { "subtitle": "약 가로 12cm × 세로 12cm × 높이 4cm", "imageIndices": [] },
  "color": { "subtitle": "화이트 / 블랙 2 색상", "imageIndices": [] },
  "usage": { "subtitle": "3 스텝으로 끝나는 간단 비행", "imageIndices": [] },
  "detailImageIndices": [1, 5, 6, 7],
  "productInfo": [
    { "key": "제품명", "value": "미니 항공 촬영 드론 A11" },
    { "key": "사이즈", "value": "약 12 × 12 × 4 cm" },
    { "key": "재질", "value": "고품질 플라스틱" },
    { "key": "원산지", "value": "광둥성" },
    { "key": "사용연령", "value": "만 15세 이상" }
  ]
}`;

export function buildSimpleVerticalUser(input: SimpleVerticalCallInput): string {
  const { raw, heroImageMode } = input;
  return `다음 raw 제품 데이터로 simple-vertical 풍부한 출력을 통째로 생성하라.

heroImageMode: ${heroImageMode}
제품명(원문): ${raw.rawTitle}
카테고리(원문): ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션/스펙: ${raw.rawOptions}

이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 객체 1 개만 출력하라.`;
}
