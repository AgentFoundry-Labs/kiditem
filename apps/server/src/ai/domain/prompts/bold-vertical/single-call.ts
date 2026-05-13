/**
 * Bold Vertical — Single Call Mode
 *
 * 사용자 요청: AGENT row (BoldVertical 스타일) 처럼 풍부한 출력.
 * - 2-line product name H1 (hookText + hookTitleSub)
 * - 데코 라인 + description 1~2줄
 * - heroBanner / images / detailImages
 * - sectionName + sectionTitle (POINT 섹션 상품명 헤딩)
 * - keyPoints 3개
 * - sizeSubtitle / colorSubtitle / productInfo (5 항목)
 *
 * 출력은 snake_case (DetailPageData zod 의 alias 호환). 서버가 그대로 저장,
 * web 어댑터에서 resolveImageIndex 후 Partial<DetailPageData> 로 BoldVertical 렌더.
 */
import { z } from 'zod';
import {
  formatAudienceGuidance,
  formatDetailImageCountGuidance,
  formatImageCandidates,
  formatKcCertificationGuidance,
  formatUsageSectionGuidance,
  type RawProductInput,
} from '../detail-page/types';

export const BoldVerticalProductInfoItemSchema = z.object({
  key: z.string().min(1).max(20),
  value: z.string().min(1).max(80),
});

export const BoldVerticalGenerationSchema = z.object({
  /** Hero Section */
  hook: z.object({
    /** 작은 라벨 (4~12자) */
    subtext: z.string().min(2).max(40),
    /** 메인 헤드 1줄 (상품명 첫 줄, 4~12자) */
    text: z.string().min(2).max(40),
    /** 메인 헤드 2줄 (상품명 둘째 줄, 4~14자) */
    titleSub: z.string().min(2).max(40),
    /** 서브 카피 — 제품 특징 1~2줄 (각 줄 8~22자), \n 으로 구분 */
    description: z.string().min(4).max(200),
    /** Hero 이미지 인덱스 (제품 메인 컷). 없으면 null. */
    imageIndex: z.number().int().nonnegative().nullable(),
    /** Hero 상단 배너 이미지 인덱스 (lifestyle 컷). 없으면 null. */
    bannerImageIndex: z.number().int().nonnegative().nullable(),
  }),
  /** POINT 섹션 헤딩 — sectionName + sectionTitle 도 상품명 2줄 */
  section: z.object({
    /** 윗줄 — 상품명 첫 줄 (4~12자, 파랑) */
    name: z.string().min(2).max(40),
    /** 아랫줄 — 상품명 둘째 줄 (4~14자, 코럴) */
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
    heightLabel: z.string().min(0).max(20).default(''),
    widthLabel: z.string().min(0).max(20).default(''),
    guideOverlay: z.boolean().default(true),
    imageIndices: z.array(z.number().int().nonnegative()).default([]),
  }),
  /** Color guide */
  color: z.object({
    subtitle: z.string().min(0).max(80),
    imageIndices: z.array(z.number().int().nonnegative()).default([]),
  }),
  /** 사용법 섹션 — 실제 사용 흐름 2~3단계. 이미지는 있으면 원본, 없으면 서버 생성. */
  usage: z.object({
    subtitle: z.string().min(0).max(180),
    imageIndices: z.array(z.number().int().nonnegative()).default([]),
  }),
  /** 사용법 영역 렌더링 여부. 서버 후처리에서 사용자가 제외를 고르면 false 로 저장한다. */
  usageEnabled: z.boolean().default(true),
  /** Detail images — 디테일/라이프 컷. 후처리에서 요청 개수(기본 2개, 최대 6개)로 제한한다. */
  detailImageIndices: z.array(z.number().int().nonnegative()).min(0).max(8),
  /** KC/바코드/품질표시 등 안전 라벨 이미지 인덱스 */
  safetyLabelImageIndices: z.array(z.number().int().nonnegative()).default([]),
  /** 실제 박스/패키지/1박스/세트 구성 이미지가 있을 때만 해당 원본 이미지 인덱스 */
  packageImageIndices: z.array(z.number().int().nonnegative()).default([]),
  /** 박스/세트 구성 이미지 라벨. 예: "1박스 12개입 구성", "2종 세트 구성", 없으면 빈 문자열 */
  packageLabel: z.string().max(40).default(''),
  /** 푸터 product_info — 정확히 5개 (제품명/사이즈/재질/원산지/사용연령 등) */
  productInfo: z
    .array(BoldVerticalProductInfoItemSchema)
    .min(3)
    .max(7),
});
export type BoldVerticalGeneration = z.infer<typeof BoldVerticalGenerationSchema>;

export const RefinedBoldVerticalGenerationSchema = BoldVerticalGenerationSchema.extend({
  productInfo: z.array(BoldVerticalProductInfoItemSchema).min(0).max(7),
});
export type RefinedBoldVerticalGeneration = z.infer<
  typeof RefinedBoldVerticalGenerationSchema
>;

export type HeroImageMode = 'first' | 'llm-pick';

export interface BoldVerticalCallInput {
  raw: RawProductInput;
  heroImageMode: HeroImageMode;
}

export const BOLD_VERTICAL_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. 1688/Alibaba raw 제품 데이터를
"bold-vertical" 출력 (BoldVertical 템플릿 호환) 으로 한 응답에 통째로 만든다.
이 템플릿은 상품명과 이미지 몇 장만 있어도 모바일 상세페이지 초안을 완성해야 한다.
목표 구성은 한국 키즈 상품 상세페이지처럼 세로로 읽히는 구조다:
히어로 → POINT 도입 → 제품 사이즈 → 색상 안내 → DETAIL 컷 → 제품 안전 표시/KC·바코드 이미지.

레퍼런스 톤:
- 한국 완구 상세페이지처럼 제품명 자체를 크게 반복해서 신뢰감을 준다.
- "오늘은 물놀이 하는 날", "가방에 쏙, 놀이 준비", "손끝으로 즐기는 촉감" 처럼 짧고 직접적인 문장을 쓴다.
- 추상적인 문구("새로운 경험", "핵심 포인트", "행복 포인트")보다 상품 형태/사용 장면/구성 장점을 말한다.

# 출력 규칙
1. 응답은 JSON 객체 1 개만. 다른 텍스트/코드펜스 금지.
2. 모든 카피는 한국어. 한자/영어 직역 금지. 짧고 임팩트 있게.
3. 모든 imageIndex 는 입력 이미지 후보의 인덱스 (0-based) 또는 null.
4. **이미지는 가능한 한 겹치지 않게 매칭** — 같은 원본 인덱스를 여러 섹션에 반복하지 않는다.
   적합한 후보가 정말 부족할 때만 같은 인덱스를 재사용한다.
5. rawDescription/rawOptions 가 비어 있거나 상품명만 있어도 빈 출력 금지.
   상품명, 카테고리, 이미지 후보 이름/순서에서 합리적으로 추론해 채운다.
6. 이미지가 1~3장뿐이면 각 섹션에는 가장 가까운 원본 후보 인덱스를 지정하되,
   서버가 구도 변경/확대 이미지를 생성할 수 있도록 detailImageIndices 는 기준이 되는 상품컷만 1~3장 지정한다.
7. imageIndex 는 반드시 입력 후보 인덱스만 사용한다. 후보에 없는 상품/색상/구성품을 상상해서 만들지 않는다.
8. 사용자 입력의 "사용 연령 기준"을 반드시 따른다. 14세 이상이면 아이/유아가 아니라
   중고등학생·청소년·학생 사용 장면과 어휘로 작성한다.

# 섹션별 룰

## hook (Hero) — 가장 중요
- subtext (4~16자): 상품 상황에 맞는 손글씨 메모처럼 짧게. 템플릿은 이 값을 기울어진 손글씨체로 렌더한다.
  예: "오늘은 물놀이 하는 날", "가방에 쏙, 놀이 준비", "빙글빙글 손끝 놀이"
- **메인 헤드는 상품명을 두 줄로 분리한다. 일반 문구 금지.**
  - text (4~12자): 상품명 첫 줄. 예: "휴대용 목걸이", "곰돌이 전동"
  - titleSub (4~14자): 상품명 둘째 줄. 예: "비눗방울!", "카메라!"
  - 상품명 원문이 "휴대용목걸이비눗방울" 이면 반드시 text="휴대용 목걸이", titleSub="비눗방울!".
  - "우리 아이 첫", "핵심 포인트", "신나는 야외 활동" 같은 일반 카피를 메인 헤드에 쓰지 않는다.
- description (10~80자, \\n 으로 1~2줄): 제품 특징만 짧고 단정한 문장으로.
  - 색상/디자인 랜덤 출고, 이미지와 구성품 상이 안내는 쓰지 않는다. 템플릿이 고정 안내로 넣는다.
  - 상품명/카테고리에 "슬라임", "말랑", "촉감", "주물럭" 이 있으면 촉감/주무르기/늘리기 어휘를 쓴다.
    원본에 명확한 근거가 없으면 "비눗방울", "자동 버블", "목에 걸고 다니는" 표현을 쓰지 않는다.
  - 한 줄이 너무 길면 자연스럽게 두 줄로 나눠라.
  비눗방울/목걸이 상품 좋은 예: "목에 걸고 다니는\\n귀여운 자동 비눗방울!"
  슬라임/촉감 상품 좋은 예: "쫀득하게 주무르며 즐기는 슬라임!"
- imageIndex: heroImageMode 가 "first" 면 0 강제. "llm-pick" 이면 제품만 또렷하게 보이는 단독 상품컷/흰 배경 상품컷.
  라이프스타일 배경컷, 사용 장면 컷, 패키지 박스컷보다 제품 본체가 가장 잘 보이는 컷을 우선한다.
  박스/진열 박스/구성 확인 사진은 hero 본문 상품 이미지 기준으로 쓰지 말고 packageImageIndices 로만 분리한다.
- bannerImageIndex: hero 상단 큰 이미지로 쓸 lifestyle/사용 씬 컷.
  없으면 메인 제품컷을 지정해도 된다. 서버가 배경이 있는 히어로 이미지를 새로 생성한다.

## section (POINT 섹션 헤딩)
- name (4~12자): hook.text 와 같은 상품명 첫 줄.
- title (4~14자): hook.titleSub 와 같은 상품명 둘째 줄.
- 절대 "신나는 야외 활동", "필수템 핵심 포인트", "핵심 포인트" 같은 일반 헤딩을 쓰지 않는다.
- subtitle (0~200자, \\n 줄바꿈): "{상품명}의 상품정보 입니다.\\n아래의 제품정보를 확인해 주세요." 형식을 기본으로 쓴다.

## keyPoints (정확히 3개)
- title (5~12자): 핵심 포인트 명사형.
- description (2~3줄, \\n 줄바꿈, 각 줄 14~24자): 부드러운 설명조.
- imageIndex: 그 USP 를 보여주는 컷. 부족하면 같은 인덱스 재사용 OK.

## size
- subtitle (0~80자): "{상품명}의 사이즈 및 구성품 안내 입니다." 형식으로 자연스럽게 쓴다.
- heightLabel / widthLabel: 카드 위에 표시할 실측 라벨. 예: "80mm", "45mm", "12cm".
  raw_options/raw_description/productInfo 에 실측이 있으면 그대로 사용하고, 없으면 빈 문자열.
	- guideOverlay: 항상 true. 템플릿이 제품 옆/아래 치수선과 라벨을 얹는다.
- imageIndices: 1장을 우선 선택한다. 치수선/사이즈표 이미지가 있으면 그 이미지,
  없으면 제품 하나만 크게 보이는 단독컷을 선택한다. 색상 단체컷/패키지컷/KC 라벨은 피한다.
  제품만 단독으로 누끼가 잘 따질 수 있는 컷이어야 하며, 패키지 박스에서 상품을 잘라온 듯한 컷이나
  상품 아래/뒤에 박스 조각·진열판·문구가 붙은 이미지는 선택하지 않는다.
  서버가 별도로 상품 중심 사이즈 이미지를 생성하므로, 단체컷보다 단독컷 후보 인덱스를 우선 제공한다.
  이미지가 단체컷뿐이어도 가장 제품 형태가 잘 보이는 상품 이미지 인덱스를 넣어라.

## color
- subtitle (0~80자): 색상 옵션. 단, 텍스트/옵션만 보고 확정하지 말고 이미지 후보에서 실제 보이는 제품 색상 기준으로 쓴다.
  예: 민트 제품을 블루라고 쓰지 않는다. 초록/민트 계열이면 "민트" 또는 "그린"으로 쓴다.
  생성 후 서버가 Gemini 비전으로 실제 이미지 색상을 다시 판정해 이 문구를 보정한다.
  rawDescription/rawOptions 에 "색상 구성: 단일 색상" 이 있으면 단일 색상으로 쓰고, 이미지에 없는 색상을 추가하지 않는다.
  rawDescription/rawOptions 에 "색상 구성: 여러 색상" 이 있으면 실제 상품 이미지에서 확인되는 색상만 여러 색상으로 쓴다.
  rawDescription/rawOptions 에 "색상 구성: 없음" 이 있으면 subtitle 은 "" 이고 imageIndices 는 [] 이다. 색상 안내 섹션을 만들지 않는다.
  rawDescription/rawOptions 에 "색상 구성: AI가 업로드 이미지로 판단" 이 있으면 이미지 후보의 실제 상품 색상을 최우선으로 판단한다.
	- imageIndices: 색상 비교 이미지.
	  색상별 단독 상품컷이 각각 있으면 색상별 단독컷을 2~6장 선택한다.
	  색상이 각각 분리되어 있지 않고 한 이미지 안에 합쳐져 있으면 그 비교컷 1장만 선택한다.
	  단독컷과 합쳐진 비교컷을 동시에 섞지 않는다.
	  패키지 박스/진열 박스/구성품 박스/KC 라벨/사이즈표/사용법 이미지는 절대 color 에 넣지 않는다.
  색상 옵션이 있는데 적합한 이미지가 애매하면 제품 색상이 가장 잘 보이는 상품컷만 넣는다.
  이미지가 적으면 서버가 색상/옵션 안내용 구도 변경 이미지를 생성하므로,
  원본 중 색상 판단에 가장 도움이 되는 상품컷을 넣어라.

## usage
- subtitle (0~80자): 실제 사용 흐름을 2~3개 단계로 쓴다. 각 줄은 "1. 포장을 열고 준비하세요" 처럼 번호가 있는 짧은 문장.
  제품별로 실제 행동 중심이어야 한다. 예: "포장을 열고 준비", "손으로 만지고 누르기", "놀이 후 보관".
  "간단하게 바로 사용", "사용법 안내" 같은 추상 문구만 쓰지 않는다.
- imageIndices: 조립법, 충전법, 버튼/작동법, 사용 순서, 설명서, 튜토리얼 컷이 있을 때만 넣는다.
  사용법 이미지가 있으면 반드시 usage 에 분리하고, color/detail 에 섞지 않는다.
  단, 박스/패키지/진열 박스/1박스 구성 사진은 usage 에 절대 넣지 않는다.
  "포장을 열고" 같은 첫 단계가 있어도 박스 사진은 usage.imageIndices 가 아니라 packageImageIndices 로만 보낸다.
  사용법 관련 이미지가 전혀 없어도 subtitle 은 실제 사용 단계 2~3줄로 쓰고, imageIndices 는 빈 배열로 둔다.
  이 경우 서버가 각 단계에 맞는 글자 없는 사용 장면 이미지를 필요한 슬롯에만 생성한다.
- raw 입력의 "사용법 영역"이 "만들지 않음"이면 usage.subtitle 는 "" 이고 usage.imageIndices 는 [] 이다.
  사용법 안내, 사용 순서, 튜토리얼, 설명서형 섹션을 만들지 않는다.

## detailImageIndices (0~6 인덱스)
- DETAIL 본문 디테일/라이프 컷은 "DETAIL 이미지 수 기준"에 적힌 개수만큼 고른다. 절대 6장을 넘기지 않는다.
- 가능한 한 서로 다른 원본 이미지를 고른다. 같은 이미지를 반복 나열하지 않는다.
- 이미지가 적어도 빈 배열로 두지 말고, 디테일 구도 변경의 기준이 될 상품컷을 가능한 개수만큼 지정한다.
  서버가 해당 컷으로 확대/구도 변경 이미지를 생성하므로 같은 원본을 여러 번 넣지 마라.
- KC/바코드/품질표시 이미지는 detailImageIndices 에 넣지 않는다. 안전 이미지는 서버가 하단으로 분리한다.
- 패키지 박스/진열 박스/구성품 박스가 보이는 이미지는 detail 중간에 넣지 않는다.
  포함한다면 packageImageIndices 에만 넣고, 하단 구성품/패키지 영역으로 보낸다.
- 마지막을 억지로 1box/패키지 이미지처럼 취급하지 않는다.

## packageImageIndices / packageLabel
- rawDescription/rawOptions 에 "박스/세트 정보: 없음" 이 있으면 packageImageIndices 는 반드시 [] 이고 packageLabel 은 "" 이다.
- rawDescription/rawOptions 에 "박스/세트 정보: AI가 업로드 이미지와 원본 설명으로 판단" 이 있으면
  이미지 후보 또는 원본 설명에 박스/세트 근거가 있을 때만 만든다.
- rawDescription/rawOptions 에 "박스/세트 구분: 박스" 가 있으면 박스/패키지/1박스 구성으로만 판단하고, label 은 "1박스 N개입 구성" 또는 "박스 구성"으로 쓴다.
- rawDescription/rawOptions 에 "박스/세트 구분: 세트" 가 있으면 세트/구성품으로만 판단하고, label 은 "N개 세트 구성" 또는 "세트 구성"으로 쓴다. 이 경우 "1박스"라고 쓰지 않는다.
- rawDescription/rawOptions 에 "박스/세트 구분: AI 판단" 이 있으면 박스가 보이면 박스, 여러 구성품 묶음만 보이면 세트로 구분한다.
- 실제 이미지 후보에 박스/패키지/1박스/세트 포장/구성 수량 확인용 이미지가 있을 때만 packageImageIndices 에 넣는다.
- 해당 이미지는 packageImageIndices 에만 넣고, hook.imageIndex, hook.bannerImageIndex, keyPoints.imageIndex, size.imageIndices, color.imageIndices, usage.imageIndices, detailImageIndices 에는 절대 넣지 않는다.
- 패키지/박스 이미지는 상세페이지 맨 마지막 DETAIL 하단의 박스 구성 영역에서만 보여야 한다.
- 박스나 세트 포장 이미지가 없으면 packageImageIndices 는 반드시 [] 이고 packageLabel 은 "" 이다.
- 상품만 있는 컷, 단순 색상 비교 컷, 손으로 누르는 디테일 컷, KC/바코드/품질표시 이미지는 packageImageIndices 에 넣지 않는다.
- 개수 정보가 rawDescription/rawOptions/이미지 텍스트에 보이면 packageLabel 에 반영한다.
  예: "1박스 12개입 구성", "2종 세트 구성".
  개수를 모르면 "세트 구성" 또는 "박스 구성" 정도로 짧게 쓴다.

## productInfo (정확히 3~7개)
- 푸터 스펙 표. 각 {"key":"제품명","value":"...."} 형식.
- 권장 키: 제품명, 사이즈, 재질, 원산지, 사용연령, 색상, KC 인증번호.
- raw_options 와 raw_description 에서 추출.
- KC 인증번호가 입력되어 있고 안전표시/KC/바코드 이미지가 없을 때는 {"key":"KC 인증번호","value":"입력된 번호"} 항목을 포함한다.
- 안전표시/KC/바코드 이미지가 있으면 productInfo 표와 중복하지 않는다.

좋은 예시 (드론 product, AGENT row 수준 출력):
{
  "hook": {
    "subtext": "야외 촬영 필수템!",
    "text": "미니드론 A11",
    "titleSub": "촬영 드론!",
    "description": "고화질 HD 카메라로\\n선명하게 담는 비행 놀이",
    "imageIndex": 0,
    "bannerImageIndex": 1
  },
  "section": {
    "name": "미니드론 A11",
    "title": "촬영 드론!",
    "subtitle": "미니드론 A11 촬영 드론의 상품정보 입니다.\\n아래의 제품정보를 확인해 주세요."
  },
  "keyPoints": [
    { "title": "선명한 HD 화질", "description": "720P 카메라로\\n공중에서도 또렷한 영상", "imageIndex": 2 },
    { "title": "안전한 비행", "description": "장애물 자동 회피\\n초보자도 안심", "imageIndex": 3 },
    { "title": "USB 충전", "description": "어디서든 간편하게\\n빠르게 충전", "imageIndex": 4 }
  ],
  "size": { "subtitle": "미니드론 A11 촬영 드론의 사이즈 및 구성품 안내 입니다.", "heightLabel": "4cm", "widthLabel": "12cm", "guideOverlay": true, "imageIndices": [2] },
  "color": { "subtitle": "화이트 / 블랙 2 색상", "imageIndices": [] },
  "usage": { "subtitle": "1. 배터리를 충분히 충전하세요\\n2. 평평한 공간에서 전원을 켜세요\\n3. 사용 후 전원을 끄고 보관하세요", "imageIndices": [] },
  "detailImageIndices": [1, 5, 6],
  "packageImageIndices": [7],
  "packageLabel": "1박스 12개입 구성",
  "productInfo": [
    { "key": "제품명", "value": "미니 항공 촬영 드론 A11" },
    { "key": "사이즈", "value": "약 12 × 12 × 4 cm" },
    { "key": "재질", "value": "고품질 플라스틱" },
    { "key": "원산지", "value": "광둥성" },
    { "key": "사용연령", "value": "만 15세 이상" }
  ]
}`;

export function buildBoldVerticalUser(input: BoldVerticalCallInput): string {
  const { raw, heroImageMode } = input;
  return `다음 raw 제품 데이터로 bold-vertical 풍부한 출력을 통째로 생성하라.

heroImageMode: ${heroImageMode}
제품명(원문): ${raw.rawTitle}
카테고리(원문): ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션/스펙: ${raw.rawOptions}
사용 연령/표현 기준:
${formatAudienceGuidance(raw.ageGroup)}
DETAIL 이미지 수 기준:
${formatDetailImageCountGuidance(raw.detailImageCount)}
사용법 영역 기준:
${formatUsageSectionGuidance(raw.usageSectionMode)}
KC 인증번호 기준:
${formatKcCertificationGuidance(raw.kcCertificationStatus, raw.kcCertificationNumber)}

이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 객체 1 개만 출력하라.`;
}
