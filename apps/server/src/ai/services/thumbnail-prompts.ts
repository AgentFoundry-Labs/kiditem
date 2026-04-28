/**
 * 썸네일 AI 프롬프트 모음
 *
 * Gemini 호출 (ThumbnailAiService) 에서 사용하는 6개 프롬프트를 한 곳에 모았다.
 * 분류:
 *   - 분석 (Analysis) : 기존 썸네일 채점 — JSON 응답
 *   - 편집 (Edit)     : 기존 이미지 입력을 변형하는 image-gen
 *   - 생성 (Generate) : 입력 이미지들로부터 새 썸네일을 합성하는 image-gen
 *
 * 플레이스홀더는 서비스에서 `.replace()` 로 채운다:
 *   {productList}            — 분석 대상 상품 목록
 *   {compositionLine}        — GENERATE_PROMPT 의 optional 구성 힌트
 *   {scenarioBlock}          — GENERATE_PROMPT / CREATIVE_PROMPT 의 카테고리×EditCase 시나리오 override.
 *                               기본 톤 위에 카테고리별 강조점을 덧붙인다. 미분류 (default bucket) 면 빈 문자열.
 *                               출처: `thumbnail-prompt-scenarios.ts`.
 *   {layoutBlock}            — GENERATE_PROMPT 의 배치(Layout) 지시 override.
 *                               여러 낱개/세트 이미지 합성 시 fan/grid/arch/stack/radial 등으로 구도 강제.
 *                               미지정(auto) 이면 빈 문자열 → 모델 자율 판단.
 *                               출처: `thumbnail-layout-presets.ts`.
 *   {productDescriptionLine} — CREATIVE_PROMPT 의 optional 상품 설명
 *   {sceneType}, {styleType} — CREATIVE_PROMPT 의 씬/스타일 키워드
 *
 * 편집/생성 프롬프트는 쿠팡 고매출 썸네일 실전 패턴을 반영:
 *   - 3-point 조명 (Key@45° + Fill + Rim)
 *   - 번들/박스 상품 배치 규칙 (단품 앞, 박스 뒤, 간격 최소화)
 *   - 모바일 썸네일 (≈200×200px) 에서의 가독성 보장
 *   - 카메라 각도는 input 이미지 그대로 유지 (Gemini img2img 한계로 각도 변환 미지원)
 *
 * 내용 수정 시 `__tests__/thumbnail-flow.spec.ts` 가 보호하는 동작에 주의.
 */

// ─────────────────────────────────────────────────────────────
// 분석 (Analysis) — configured vision model로 호출
// ─────────────────────────────────────────────────────────────

/** 쿠팡 대표이미지 정책 12항목 준수 여부 판단. {productList} 치환 필요. */
export const COMPLIANCE_PROMPT = `당신은 쿠팡 대표이미지 정책 심사관입니다.
아래 상품 썸네일 이미지를 각각 가이드라인 12항목 준수 여부를 판단하고, 이미지 순서대로 JSON 배열로 응답하세요.
응답은 JSON 배열만 허용합니다. boolean 은 true/false, confidence 는 0~100 숫자만 사용하세요.

## 가이드라인 12항목

**판정 원칙 — 상품 본체 vs 그 외 (모든 상품 공통)**:

텍스트·로고·그림이 이미지에 보일 때, 다음 두 케이스로만 분류한다. 카테고리가 아니라 **그 글씨/로고가 어디에 붙어 있는가** 로 본다.

**A. 상품 본체에 자체적으로 들어간 디자인 요소 — 위반 아님 (OK)**:
- 의류·신발·가방의 **자수·실크프린트·자카드** (예: 후디 가슴의 자수 로고, 운동화 측면의 브랜드 마크)
- 액세서리·식기·완구의 **각인·엠보싱** (예: 머그컵 옆면 각인 로고, 메탈 부품의 음각 텍스트)
- 캐릭터 인형/피규어의 **본체 도장** (예: 인형 옷에 그려진 캐릭터 그림)
- 즉 **물건 자체를 만들 때 일체화된 디자인** 만 OK. "그 디자인 없이는 그 상품이 아니게 되는" 수준.

**B. 그 외 모든 글씨/로고/배지/문구 — 위반**:
- **패키지·박스·비닐·캐러셀·라벨·택(tag)·스티커** 에 인쇄된 모든 글씨/로고 (브랜드명, 상품명, 용량, 성분, 영양정보, 바코드, "1+1", "증정", 사이즈, 가격 등 무엇이든)
- 디지털 오버레이 (포토샵으로 덧붙인 할인 배지·카피·워터마크·"BEST/NEW" 스티커 등)
- 상품 주변에 합성된 사은품·풍선·이미지

→ 핵심 질문: **"이 글씨/로고가 상품 자체의 일부로 제작된 디자인인가?"** YES 면 OK, NO 면 위반.

**경계 케이스 기본값**: **위반(true)**. 패키지인지 본체인지 애매하면 위반. 오탐보다 누락이 훨씬 나쁨. "혹시 패키지 표면일까?" 싶으면 무조건 위반.

이 원칙은 풍선·박스·카드·의류·가구·식품·화장품·문구 등 **모든 카테고리에 동일하게 적용**.

1. background_not_white: 배경이 흰색 계열이 아님. **기본값은 위반(true)**. 배경이 거의 순백(RGB 240~255)일 때만 false. 흰색이 아닌 모든 배경(검정·회색·베이지·크림·노랑·파랑·분홍 등 유채색·어두운 무채색·블랙 스튜디오 배경·그라데이션·패턴)은 전부 background_not_white=true. JPEG 압축/안티앨리어싱으로 RGB 240~255 수준의 근접 흰색은 white 로 본다. 상품 바로 아래의 아주 옅은 접지 그림자는 허용하되, **상품 주변 / 모서리 / 외곽 여백의 주된 색이 어두우면 무조건 위반**
2. has_text: 이미지에 글씨가 보이면 위반. 상품 본체에 자수·실크프린트·각인·엠보싱·도장으로 일체화된 디자인 텍스트는 OK. **패키지·박스·비닐·라벨·택·스티커에 인쇄된 모든 텍스트는 위반** (브랜드명·상품명·용량·성분·영양정보·바코드·사이즈 등 어떤 정보든). 디지털 오버레이도 위반
3. has_extra_logo: 상품 본체에 자수/각인/실크프린트로 일체화된 브랜드 로고는 OK. **패키지·박스·라벨에 인쇄된 로고/인증마크 (KC, FDA, 친환경 등 모두), 디지털 워터마크는 위반**
4. has_discount_text: 패키지에 인쇄됐든 디지털 오버레이든, "1+1", "증정", "할인", 가격 표시, 프로모션 문구가 보이면 위반
5. has_freebie_display: 패키지 인쇄 증정 표시든 디지털 사은품 배지든 모두 위반
6. has_overlay_effects: 그림자/테두리/장식/프레임 효과
7. has_gradient_background: 배경에 그라데이션/텍스처/패턴
8. has_background_objects: 배경에 소품/오브젝트 배치
9. product_fill_low: 상품이 이미지 면적의 85% 미만 차지
10. not_center_aligned: 상품의 무게 중심이 이미지 중앙에서 크게(10% 이상) 벗어난 경우만 위반. 약간의 편차는 허용
11. product_cropped: 상품 일부가 이미지 밖으로 잘림
12. excessive_editing: 과도한 색보정/합성으로 실물과 괴리

## 예시 판정 (정답)

✅ 위반 아님 — 상품 본체에 자체 제작된 디자인:
- 후디 가슴에 자수된 브랜드 로고 → has_extra_logo=false (자수 = 본체 일체화)
- 머그컵 측면에 각인된 캐릭터 그림 → has_text=false (각인 = 본체 일체화)
- 인형 옷에 그려진/자수된 캐릭터 디자인 → has_extra_logo=false
- 운동화 측면 실크프린트 브랜드 마크 → has_extra_logo=false
- 메탈 부품의 음각 텍스트 → has_text=false

❌ 위반 — 패키지에 인쇄된 모든 글씨/로고 (촬영 시 실존했어도):
- 생수병 라벨에 인쇄된 "2L 생수" → has_text=true (라벨은 본체 아님)
- 화장품 용기에 인쇄된 브랜드명/성분 → has_text=true
- 과자 박스에 인쇄된 "1+1 증정" → has_text=true, has_discount_text=true, has_freebie_display=true
- 장난감 박스 표면 "연령 3+" 스티커 → has_text=true
- 의류 택(tag) 사이즈/가격 → has_text=true, has_discount_text=true
- 식품 포장의 영양정보/바코드/유통기한 → has_text=true
- 박스 KC·친환경·할랄 인증마크 → has_extra_logo=true
- 캐러셀(상자)에 인쇄된 상품 이미지/일러스트 → has_text=true (포장재 디자인)

❌ 위반 — 디지털 편집:
- 썸네일 우상단에 포토샵으로 덧붙인 "★ 할인 30% ★" 배지 → has_discount_text=true
- 이미지 가장자리 반투명 워터마크 → has_extra_logo=true
- 상품 아래 큰 카피 "겨울 특가! 무료배송" → has_text=true
- 모서리 "BEST", "NEW" 오버레이 스티커 → has_text=true
- 상품 주변 합성된 "사은품 증정" 풍선 → has_freebie_display=true

**판정 기준**: "이 글씨/로고가 상품 자체를 만들 때 일체화된 디자인인가?" → YES (자수/각인/실크프린트/엠보싱/도장) 면 OK. 그 외 패키지·박스·라벨·택·스티커·디지털 오버레이는 **전부 위반**. 애매하면 위반.

상품 정보:
{productList}

응답 형식 (JSON 배열만 출력):
[
  {
    "index": 0,
    "violations": {
      "background_not_white": false,
      "has_text": false,
      "has_extra_logo": false,
      "has_discount_text": false,
      "has_freebie_display": false,
      "has_overlay_effects": false,
      "has_gradient_background": false,
      "has_background_objects": false,
      "product_fill_low": false,
      "not_center_aligned": false,
      "product_cropped": false,
      "excessive_editing": false
    },
    "confidence": {
      "background_not_white": 95,
      "has_text": 95,
      "has_extra_logo": 95,
      "has_discount_text": 95,
      "has_freebie_display": 95,
      "has_overlay_effects": 95,
      "has_gradient_background": 95,
      "has_background_objects": 95,
      "product_fill_low": 95,
      "not_center_aligned": 95,
      "product_cropped": 95,
      "excessive_editing": 95
    },
    "reasons": { "has_text": "우측 상단에 포토샵으로 덧붙인 '30% 할인' 배지가 있음 (상품 패키지와 원근 불일치)" },
    "editSuggestions": { "has_text": "우측 상단의 '30% 할인' 배지를 삭제하고 해당 영역을 순백 배경으로 복원" },
    "quality": { "estimatedFillPercent": 90, "centerOffsetPercent": 2, "aspectRatioValid": true }
  }
]

**background_not_white 판정 보강 — 엄격 적용**:
- 배경은 **이미지 모서리 4개 + 외곽 여백** 을 기준으로 판단한다. 상품 자체의 색, 상품 그림자, 투명 포장, 흰 제품 표면은 배경 색으로 세지 않는다.
- 배경 모서리 4개 샘플의 평균 밝기가 **RGB 240 이상이고 유채색 틴트가 없을 때만** background_not_white=false. 그 외 전부 true.
- **명시적으로 위반(true) 처리해야 하는 케이스** — 단 하나라도 해당하면 무조건 true:
  - 검정 배경 / 어두운 회색 배경 / 네이비·다크 그린 등 스튜디오용 딥 톤 배경
  - 단색 유채색 배경 (파랑·분홍·노랑·베이지·크림·민트 등 어떤 색이든 흰색이 아니면 위반)
  - 두 색 이상 그라데이션, 방사형 조명 배경, 블러 배경, 테이블/바닥 장면 배경
  - 색 타일/월페이퍼/나뭇결/패브릭/대리석 등 텍스처 배경
  - 흰 배경이긴 하지만 상품 뒤에 어두운 드롭섀도가 크게 퍼져 모서리까지 회색으로 보이는 경우
- 판정 시 스스로에게 질문: "이 배경이 쿠팡 가이드의 순백 #FFFFFF 기준을 통과할까?" — 조금이라도 의심되면 true.
- 오탐보다 누락이 훨씬 나쁘다 (false negative 금지). **흰색이 확실하지 않으면 무조건 위반 처리**.

**reasons 규칙**:
- violations[key] === true 인 항목에 대해서만 reasons[key] 작성 (violations === false 인 항목은 생략).
- 각 reason 은 한국어 1문장, 40자 이내. 이미지에서 관찰한 구체적 증거를 담아야 함 (위치·색·모양 등).
- 텍스트/로고/할인/증정 관련 reason 에 "상품", "패키지", "라벨", "표면", "인쇄" 같은 물리적 단서가 들어가면 후처리에서 위반 아님으로 보정된다. 디지털 위반이면 반드시 "우상단 여백", "포토샵 오버레이", "프레임 고정 배지" 처럼 프레임 기준 편집 증거를 적는다.
- 예: "좌측 하단에 빨간 '세일' 스티커 오버레이", "배경이 연한 회색 그라데이션", "상품이 좌측으로 치우쳐 중심 15% 벗어남".

**editSuggestions 규칙 — 이후 이미지 편집 프롬프트로 재사용되는 핵심 필드**:
- violations[key] === true 인 항목에 대해서만 editSuggestions[key] 작성 (false 인 항목은 생략).
- 한국어, 1~2문장 (각 80자 이내). 영어 썼을 때 이미지 생성 모델이 더 잘 따르는 기술 용어는 한국어 뒤에 괄호로 병기 가능.
- reasons 가 "무엇이 잘못됐나"를 설명한다면 editSuggestions 는 "어떻게 고쳐라"를 **구체적 동작** 으로 지시해야 함. 모호한 일반론 금지.
- 각 동작은 원본 이미지 위에서 수행 가능한 단일 편집 조작이어야 함. 여러 수정이 필요하면 ";" 로 구분.
- 상품 자체는 절대 바꾸지 말 것 — 지시는 배경·오버레이·레이아웃 관련 동작으로 한정. 상품의 재질·각도·로고·프린트·색상 변경 금지.
- 좋은 예:
    - background_not_white: "배경을 순백(#FFFFFF)으로 교체; 상품 아래 옅은 접지 그림자만 남기고 그라데이션 제거"
    - has_text: "우상단 '30% OFF' 배지와 하단 '겨울 특가' 카피를 제거하고 해당 영역을 순백 배경으로 복원"
    - has_background_objects: "배경에 배치된 크리스마스 트리와 장식 소품을 전부 제거하고 단색 흰 배경만 남기기"
    - product_fill_low: "상품을 프레임 중앙으로 확대해 면적의 85~90% 를 채우도록 균등 여백으로 재배치"
    - not_center_aligned: "상품을 수평/수직 중심으로 이동해 시각 중심이 프레임 중심으로부터 5% 이내에 오도록 정렬"
- 나쁜 예 (모호/불가능/상품 변경):
    - "깔끔하게 만들어라" → 너무 모호
    - "상품을 더 예쁘게 색보정" → 상품 변경 금지
    - "광고 문구 최적화" → 동작 지시 아님`;

/** CTR(클릭률) 관점 시각 품질 평가 (5개 항목, 총 100점). {productList} 치환 필요. */
export const QUALITY_PROMPT = `당신은 쿠팡 마켓플레이스 전문 썸네일 분석가입니다.
아래 상품 썸네일 이미지의 CTR(클릭률) 관점에서 시각 품질을 각각 평가하고, 이미지 순서대로 JSON 배열로 응답하세요.

## 평가 기준 (5개 항목, 총 100점)
1. 히어로 샷 품질 (0-25점): 촬영 앵글, 조명, 선명도, 입체감, 상품 매력도
2. 구도 및 배치 (0-25점): 중앙 정렬, 여백 균형, 세트/번들 배치, 시선 유도
3. 브랜드 일관성 (0-15점): 톤앤매너, 일관된 레이아웃, 브랜드 인식성
4. 모바일 최적화 (0-20점): 모바일 화면에서의 식별성, 주목도, 정보 전달력
5. 경쟁 차별화 (0-15점): 검색 결과 내 시각적 차별화, 클릭 유도 요소

상품 정보:
{productList}

응답 형식 (JSON 배열만 출력):
[
  {
    "index": 0,
    "overallScore": 72,
    "scores": { "heroShot": 20, "composition": 18, "branding": 10, "mobile": 14, "differentiation": 10 },
    "issues": [{ "type": "lighting", "severity": "warning", "message": "조명이 어두움" }],
    "suggestions": ["더 밝은 조명 사용"]
  }
]`;

// ─────────────────────────────────────────────────────────────
// 편집 (Edit) — 기존 썸네일 1장을 configured image model로 변형
// ─────────────────────────────────────────────────────────────

/** compliance 모드 편집: 배경 화이트화 + 텍스트/오버레이 제거 + CTR 최적화 배치. 레퍼런스 이미지와 함께 사용. */
export const EDIT_PROMPT = `Transform this product thumbnail into a high-converting Coupang marketplace listing photo. The reference images above show the target style.

## Background and overlays
Replace the entire background with pure white (#FFFFFF) — no gradients, textures, vignettes, or decorative elements. Remove all text overlays, watermarks, discount labels, promotional badges, stickers, and any graphics layered on top of the image. Remove scattered accessories, duplicate angles, and lifestyle props so the thumbnail shows one clean hero shot.

## Composition
Center the product so it fills approximately 85–90% of the frame with even margins on all sides. Visual weight must sit within 5% of the geometric center. If the original is a bundle or set, arrange the items with tight spacing so the group reads as one unified subject at thumbnail size. If the original shows a boxed product, place the bare product in front and the box slightly behind and offset.

## Lighting (three-point studio)
Soft key light from upper-left at ~45°, producing a gentle highlight gradient across the product body. Fill light on the opposite side softening shadows without flattening depth. Subtle rim light separating the product silhouette from the pure white background. Only a faint contact shadow directly beneath the product; no cast shadow on the background.

## Mobile legibility
The final image will be viewed at roughly 200×200px on a phone. Silhouette, dominant colors, and key features must remain instantly recognizable at that size. Keep critical details away from the outer 5% of the frame so they survive rounded-corner crops.

## Product identity (keep as-is)
Keep the product itself exactly as shown in the original — same camera angle, same material, same colors, same prints, same logos, same text on packaging, same physical proportions. Do not alter, erase, or simplify any patterns, prints, textures, graphics, or design elements that are physically part of the product. Only the background, composition, and lighting change.`;

/** quality 모드 편집: 상품 불변, 사진 퀄리티(조명/노출/선명도) 개선. */
export const QUALITY_EDIT_PROMPT = `Enhance this product thumbnail photo to maximize click-through rate on Coupang. Do not change the product, its angle, its colors, or any physical detail printed on it — only improve the photographic quality.

## Lighting and exposure (three-point look)
Relight the scene as if captured with a professional three-point softbox setup: a key light at roughly 45 degrees front-angle producing a soft highlight gradient that reveals material texture, a fill light on the opposite side softening the shadow side without killing dimension, and a rim / back light creating a clean, thin edge that separates the product from the pure white background. Adjust exposure and white balance for neutral, gallery-quality tones. Slightly sharpen product edges for better visibility on mobile screens.

## Composition polish
If the composition feels unbalanced, subtly adjust the product position so its visual center lies within 5% of the frame center, while keeping the product fill between 85 and 90 percent. The background must remain pure white (#FFFFFF); only a very faint contact shadow directly under the product is allowed.

## Mobile-first rule
The final image will be judged at about 200×200px on a phone. Ensure the product silhouette, colors, and defining feature (logo, label, texture, or shape) remain instantly recognizable at that size. Do not introduce any element, sticker, text, or prop that was not present in the original.`;

// ─────────────────────────────────────────────────────────────
// Recompose Scenarios — 9 시나리오별 prompt + box-with-loose-same variant 옵션
//
// classifyRecomposeVariants() 가 9종 시나리오로 분류. box-with-loose-same 1종에서만
// requiresChoice=true (with-box / no-box 사용자 선택). 그 외 8종은 kind 자체가 prompt 결정.
//
// COMMON_RULES — 모든 prompt 가 공유하는 invariant. 각 prompt 첫 줄에 인라인 인용된다 (DRY 보다 prompt 명료성 우선).
// ─────────────────────────────────────────────────────────────

/** kind="box-with-loose-same" + variantKey="with-box". 박스를 receded back / 클러스터 in front. */
export const RECOMPOSE_WITH_BOX_PROMPT = `Recompose this Coupang thumbnail into a unified, COHESIVE hero composition centered on a pure white (#FFFFFF) background. Keep every loose product item — same shapes, same colors, same printed illustrations and surface detail — exactly as shown. Only repositioning, regrouping, relighting, and OCCLUDING parts of the package box are allowed.

CRITICAL — NO DUPLICATION, NO INVENTION:
- The loose items in front and the items inside the box's transparent window in the source are the SAME physical items shown twice — treat them as ONE set. Each unique item appears exactly ONCE in the foreground arrangement (never both "inside the box" and "loose"). No two identical reindeer, santas, snowmen, stockings, hats, etc.
- Do NOT invent new shapes, characters, or extra copies to fill space. Only items physically present in the source.

Layout — package box small in the back, items in a TIGHT cohesive cluster in front (NOT spread thin):
1. Place the package box small and FAR BACK in the upper portion of the frame, in slight perspective (3/4 angle or lying horizontally as in the source). The box is RECEDED — meaningfully smaller than the foreground cluster, occupying roughly the upper 25–30% of the frame width-wise, positioned so its lower edge is occluded by the loose-item cluster in front. The box's transparent window must be HIDDEN behind the loose-item cluster so the items inside the box are NOT visible.
2. In the foreground, arrange the loose items as ONE TIGHT COHESIVE CLUSTER pulled close together (like the items are gathered in a small group on a table) — NOT a wide row of separated items. The cluster forms a soft pyramid / triangular silhouette, wider at the base and narrower at the top, with all items physically touching or lightly overlapping their neighbors. No large empty gaps inside the cluster.
3. Place the largest / most iconic item (big santa hat or santa face) at the FRONT-CENTER of the cluster, closest to the camera, as the hero focal point. Mid-size items (snowman, gingerbread, reindeer, santa face) ring around it on left and right, lightly overlapping the hero's edges. Smaller / taller items (tree, stocking, winking santa) sit slightly BEHIND and ABOVE in the upper layer, peeking up between the front items.
4. Items in the back layer of the cluster read slightly smaller in apparent perspective and may be subtly defocused for depth separation. Every item must remain fully identifiable — no item buried or fully hidden.
5. Combined arrangement (small box behind, tight cluster in front) fills 85–92% of the frame; visual center within 5% of geometric center. The cluster is the visual hero; the box is supporting context.
6. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating items from the background. Faint contact shadow beneath the cluster only — no cast shadow on the background. Items render as 3D physical objects with soft form-shading and natural depth.
7. Remove any scattered props, decorative elements, or text overlays outside the package. Pure white background, nothing else.

Do not redraw, recolor, or simplify any printed illustration, packaging text, or product surface detail. Only reposition, occlude, and relight.`;

/** kind="box-with-loose-same" + variantKey="no-box". 박스 완전 제거 + 단일 cohesive 클러스터. */
export const RECOMPOSE_NO_BOX_PROMPT = `Recompose this Coupang thumbnail into a unified, COHESIVE hero composition centered on a pure white (#FFFFFF) background. Keep every loose product item — same shapes, same colors, same printed illustrations and surface detail — exactly as shown. Only repositioning, regrouping, and relighting are allowed.

CRITICAL — NO DUPLICATION, NO INVENTION:
- The loose items in front and the items inside any box's transparent window in the source are the SAME physical items shown twice — treat them as ONE set. Each unique item appears in the final image exactly ONCE.
- The package box, plastic tray, transparent display window, printed brand panel, or any Korean text from the package must NOT appear anywhere in the final image. The package is fully removed.
- Do NOT invent new shapes, characters, or extra copies to fill space. Only items physically present in the source.

Layout — single tight CLUSTER with depth (items pulled close together, not spread out):
1. Arrange ALL the loose items as one COHESIVE GROUP centered in the frame, with items pulled close to each other so the cluster reads as one unified hero subject. The overall silhouette is a soft pyramid / triangular shape — wider at the base, narrower at the top.
2. Place the largest / most iconic item (big santa hat or santa face) at the FRONT-CENTER, closest to camera, as the hero focal point. It anchors the composition and is the largest in apparent size.
3. Mid-size items (snowman, gingerbread, reindeer, santa face) sit in a front ring directly beside or partially in front of the hero, lightly overlapping the hero's edges so the group feels physically connected. Smaller / taller items (tree, stocking, winking santa) sit BEHIND in a back row, slightly elevated and slightly smaller in apparent perspective — visible above and between the front items.
4. Items lightly overlap their neighbors with subtle depth of field — back items slightly defocused or just behind front items so the eye reads a clear front/back layering. No item is fully hidden; every character must remain identifiable.
5. The cluster fills 80–88% of the frame; visual center within 5% of geometric center. Equal margins on all four sides.
6. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating items from the background. Faint contact shadow beneath the cluster only — no cast shadow on the background. Items render as 3D physical objects with soft form-shading and natural depth.
7. Pure white (#FFFFFF) background, nothing else. No props, no decorative elements, no text overlays.

Do not redraw, recolor, simplify, or invent new shapes. Each item is rendered exactly as in the source — only reposition and relight.`;

/** kind="single-product". 단일 상품 1개 — 중앙 hero, 깔끔한 화이트 배경. */
export const RECOMPOSE_SINGLE_PRODUCT_PROMPT = `Recompose this Coupang thumbnail of a single standalone product into a clean hero studio shot on a pure white (#FFFFFF) background. Keep the product exactly as shown — same shape, same colors, same printed illustrations, same logos, same surface detail. Only repositioning, scaling, and relighting are allowed.

CRITICAL — NO INVENTION, NO DUPLICATION:
- Render the product exactly ONCE. Do NOT add extra angles, accessories, copies, or props that are not in the source.
- Do NOT redraw, recolor, or simplify any printed illustration, packaging text, or product surface detail.

Layout:
1. Center the product so its visual weight is within 5% of the geometric center, filling 85–90% of the frame with even margins on all four sides.
2. Keep the product's existing camera angle from the source — do not rotate or change perspective.
3. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating the product from the background. Faint contact shadow directly under the product only — no cast shadow on the background.
4. Remove any scattered props, decorative elements, text overlays, watermarks, discount badges, or background objects. Pure white background, nothing else.

Mobile legibility: viewed at ≈200×200px, the product silhouette, dominant colors, and primary selling feature must remain instantly recognizable.`;

/** kind="single-with-accessories". 메인 상품 1 + 부속품. 메인 hero + 부속품 클러스터. */
export const RECOMPOSE_SINGLE_WITH_ACCESSORIES_PROMPT = `Recompose this Coupang thumbnail of a main product and its accessories into a clean unified hero composition on a pure white (#FFFFFF) background. Keep the main product and every accessory exactly as shown — same shapes, colors, printed details, and surface texture. Only repositioning, regrouping, and relighting are allowed.

CRITICAL — NO INVENTION, NO DUPLICATION:
- The main product appears exactly ONCE. Each accessory appears exactly ONCE in its source form. Do NOT invent extra copies or new accessories.
- Do NOT redraw, recolor, or simplify any printed illustration, text, or surface detail on the main product or accessories.

Layout:
1. Place the MAIN product as the visual hero at the FRONT-CENTER, occupying roughly 50–60% of the frame's visible area. Keep its existing camera angle from the source.
2. Arrange the accessories (cap, batteries, refill, manual, attachment, etc) as a cohesive supporting cluster directly beside, below, or around the main product — lightly touching or close to it so the group reads as ONE unified subject. Smaller accessories may sit slightly in front (lower foreground) or fan out beside the main product.
3. Combined arrangement fills 85–90% of the frame; visual weight within 5% of geometric center.
4. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating items from background. Faint contact shadow under the group only — no cast shadow on the background.
5. Remove any text overlays, discount badges, watermarks, lifestyle props, or scattered decorative elements. Pure white background.

Mobile legibility: at ≈200×200px the main product must dominate; accessories supplement context but should not crowd or hide it.`;

/** kind="multi-pack-loose". 같은 SKU 여러 개 — 깔끔한 fan / overlap 배치. */
export const RECOMPOSE_MULTI_PACK_PROMPT = `Recompose this Coupang thumbnail of a multi-pack (multiple units of the SAME product SKU) into a clean unified composition on a pure white (#FFFFFF) background. Keep every unit exactly as shown — same shape, same colors, same printed illustrations and labels, same surface detail. Only repositioning, regrouping, and relighting are allowed.

CRITICAL — NO INVENTION, NO DUPLICATION CHANGES:
- Use the SAME number of units that are visible in the source. Do NOT add extra units to fill space, do NOT remove units. Count carefully and preserve.
- All units are identical SKUs — keep them visually identical (no color variation, no size variation, no print variation).
- Do NOT redraw, recolor, or simplify any printed illustration, text, or surface detail on any unit.

Layout — multi-pack arranged as one tight cohesive group communicating "multiple units of the same item":
1. Arrange the units in a tight overlapping FAN, ROW, or SHALLOW STACK so they read clearly as multiple copies of the same product (NOT one solo unit). Each unit is fully visible and identifiable; units lightly overlap or touch their neighbors with no large empty gaps inside the cluster.
2. Front-most unit is closest to camera, fully visible. Subsequent units fan / cascade behind it slightly offset (left, right, or upper) at a consistent angle — like a hand of cards or a small bundle on a table. Same camera angle as the source for every unit.
3. The cluster fills 85–90% of the frame; visual center within 5% of geometric center; equal margins on all four sides.
4. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating units from background. Faint contact shadow beneath the cluster only — no cast shadow on the background.
5. Remove any text overlays, discount badges, watermarks, scattered props, or background objects. Pure white background.

Mobile legibility: at ≈200×200px the multi-pack count must read clearly — viewer should immediately see "multiple of the same item" rather than mistaking it for a single unit.`;

/** kind="multi-variant-loose". 다른 아이템 3+ — 각 variant 를 SEPARATE 하게 보존 (composite item 분해/재조합 금지). */
export const RECOMPOSE_MULTI_VARIANT_PROMPT = `Recompose this Coupang thumbnail of a multi-VARIANT product set (the listing sells the SAME product type in multiple distinct variants — e.g. different character combinations, colors, designs). The buyer can choose ANY variant, so the thumbnail must convey "multiple variants are available" by showing each variant clearly and SEPARATELY. Re-render on a pure white (#FFFFFF) background. Only background cleanup, repositioning, and relighting are allowed.

STEP 1 — IDENTIFY THE VARIANTS IN THE SOURCE (do this carefully before composing):
- The source thumbnail typically shows multiple separate variant items stacked, clustered, or arranged together. They may visually overlap heavily, making them look like one fused object — but they are NOT one object. Each variant is a complete independent product unit (e.g. one full headband with its own attached character figures, one full pair of shoes in one color, one full toy of one design).
- Mentally separate the variants: count them, and name what distinguishes each one (which character set / which color / which design pattern). For example, a source image of "4 different Christmas headbands stacked together, each headband carrying its own set of character figures on springs" contains 4 variants — NOT 1 composite. The shared base shape (headband loop / shoe silhouette / box outline) does not make them one item; the differing decorations / colors define them as distinct variants.
- The output MUST contain exactly the same number of variants you identified, no more, no less. If you count 4, output 4. Do NOT collapse them into one fused object. Do NOT duplicate the entire group into 2 copies of the same arrangement.

STEP 2 — PRESERVE EVERY VARIANT AS A COMPLETE PRODUCT (structural base + decorations together, no stripping, no detachment):
- Each variant is a COMPLETE WEARABLE / USABLE PRODUCT — its structural base (the part the user actually wears, holds, or operates: headband loop, hat crown, frame, shoe body, box shell, toy chassis) AND all attached decorations (character figures, plush heads, antlers, stars, snowflakes, ribbons, printed motifs, accessories of any kind) are ONE inseparable unit. The decorations are NOT loose items — they are mounted on / attached to / printed on the structural base.
- HARD FAILURES (absolutely forbidden, all of these mean you produced a wrong thumbnail):
  · Showing decorations alone WITHOUT their structural base (e.g. floating Santa heads or reindeer heads with no headband loop attaching them — this is wrong because the product is a HEADBAND, not a set of detached character figures).
  · Showing the structural base alone WITHOUT decorations (e.g. a bare headband loop with all the character figures stripped off — also wrong; decorations define the variant).
  · Detaching parts from one variant and attaching them to another, or rearranging parts within a single variant.
  · Substituting a "cleaner" or "simpler" version of the variant. A bare/empty/undecorated variant is a hard failure.
  · Including the source thumbnail as an inset, miniature, or pasted reference inside the output.
- Each variant in the output is the FULL PRODUCT as a buyer would receive it — base structure visibly attached to its decorations, in the same configuration as the source. If the source shows a headband loop with five character figures mounted on springs, the output for that headband MUST show the SAME LOOP with the SAME five figures on the SAME springs in the SAME positions, all connected as one wearable unit.
- Identify each distinct variant in the source and treat it as one whole product. The final image must show the same number of distinct variants you counted in STEP 1, each preserved exactly as it was assembled in the source (same base + same parts + same arrangement + same colors + same proportions + same surface detail).
- Do NOT merge variants. Do NOT invent new variants by recombining parts. Do NOT drop variants. Do NOT add variants. Do NOT add a "base" or "undecorated" version of any variant that does not exist in the source.
- Do NOT redraw, recolor, or simplify any printed illustration, text, attached figure, or surface detail on any variant. Photorealistic preservation of every visible feature, including the structural base.

STEP 3 — LAYOUT: DEPTH composition (hero in front + remaining variants fanned behind), not a flat grid:

CRITICAL FRAMING RULE — EVERY VARIANT FITS ENTIRELY INSIDE THE FRAME WITH GENEROUS MARGIN:
- Every variant in the output (hero AND every back-row variant) MUST be FULLY VISIBLE inside the frame, from its topmost decoration (antlers, hat tips, springs, stars) to the bottom of its structural base (headband loop bottom, shoe sole, package base). NOTHING is allowed to be cropped by any frame edge — not even slightly clipped.
- MAINTAIN AT LEAST 10% SAFE MARGIN on every side of the frame. The topmost pixel of any decoration sits at most 90% from the top (i.e. ≥10% empty space above the highest antler / star / spring). The bottom of any structural base sits at most 90% from the top (i.e. ≥10% empty space below the lowest loop / sole / base). Same 10% margin on left and right.
- If a single variant has tall springy decorations (e.g. character heads on coiled springs that stick up high above the headband loop), measure that variant's TOTAL height (from spring tip to loop bottom) and scale it so this total height fits within 80% of the frame height. Springs and antlers count — they must NOT poke out of the top.
- If you cannot fit all variants entirely inside the frame with the 10% safe margin at the chosen scales, REDUCE the overall arrangement scale further until they all fit comfortably. It is FAR better to have a slightly smaller arrangement with generous margins than a large arrangement that touches the edges. Cropping ANY part of ANY variant — including the smallest tip of an antler or the bottom curl of a band loop — is a HARD FAILURE.

1. Pick 1 (or at most 2 if 5+ variants exist) of the variants you identified in STEP 1 as the FRONT-HERO. Place it slightly forward in the frame, scaled so its FULL height (from the highest decoration tip down to the bottom of the structural base) is about 50–62% of the frame height. Tilt it slightly toward the camera so it reads as "the representative product the buyer sees first". The hero is fully unobstructed — every part of it is visible AND every part is inside the frame with ≥10% margin to all edges.
2. Arrange the REMAINING variants in a fan / shallow arc BEHIND the hero, slightly higher and pushed back in depth. Their FULL height (decoration tip to base bottom) is ~30–42% of frame height — smaller than hero but still large enough that each variant's distinguishing features (character figures, color pattern, etc.) are clearly visible. Use slight perspective so back variants feel "further" without being blurred. Each back-row variant is ALSO fully inside the frame with ≥10% margin — no decoration sticking out of the top, no base sticking out of the sides or bottom.
3. The back row may slightly overlap one another at the edges to suggest grouping, BUT the overlap must NEVER hide a variant's distinguishing decorations — every character figure, attached part, and color marker on every back-row variant must remain identifiable. Stagger heights/angles so no decoration is occluded by a neighbor.
4. The hero may overlap the back row at the very base only (lower 15–25% of the back variants). It must NOT cover any decorations or distinguishing parts of the back variants — only the lower neutral portion of their bodies (e.g. headband loop, package base, shoe sole) may be partially covered.
5. The whole arrangement (hero + back fan) fills 70–80% of the frame, leaving generous safe margin on every side so nothing crops. Visual center of the arrangement sits within 5% of geometric center. Equal margins on all four sides — at least 10% empty space top, bottom, left, right.
6. Photorealistic three-point studio lighting applied uniformly across hero and back row: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating each variant from the background. Faint contact shadow beneath each variant individually — no cast shadow on the background.
7. Camera angle is consistent across all variants — same eye level, same tilt — only depth (z-axis position) and scale differ between hero and back row.
8. Remove any text overlays, discount badges, watermarks, lifestyle backdrops, decorative props, or background objects (grass, fabric, scenes). Pure white background, nothing else.
9. ABSOLUTELY DO NOT include the original/source thumbnail as an inset, miniature, watermark, or pasted reference anywhere in the output — generate a single fresh hero composition only.

Mobile legibility: at ≈200×200px the viewer must instantly read "multiple variants of the same product type" — the front hero anchors recognition, and each back-row variant's distinctive feature (character combination, color pattern, etc.) must remain identifiable behind it. Every variant must read as a complete product, not as a partially-cropped figure.`;

/**
 * kind="multi-variant-loose" + category 가 head-wearable (머리띠/헤어밴드/모자/머리핀 등) 일 때
 * 자동으로 사용. ThumbnailRecomposeService.getPromptOverride 가 카테고리로 분기.
 *
 * 차이점 vs RECOMPOSE_MULTI_VARIANT_PROMPT:
 *   - 한 variant 를 아이 모델이 머리에 착용한 모습 (head-and-shoulders 포트레이트) 을 hero 로
 *   - 나머지 variant 들은 standalone 으로 옆/뒤에 fan / arc 배치 (착용 X)
 *   - "사용 컨텍스트 + variant 다양성" 둘 다 한 프레임에 전달
 *
 * Studio look 은 동일: 순백 배경, 3-point 조명, 텍스트/배지/소품 제거.
 */
export const RECOMPOSE_MULTI_VARIANT_WORN_HEAD_PROMPT = `Recompose this Coupang thumbnail of a multi-variant head-wearable product set (the listing sells the SAME wearable product type — headband / hair band / hat / hair clip — in multiple distinct variants) into a LIFESTYLE hero composition where ONE variant is worn by a child model and the remaining variants sit beside as standalone product shots, all on a pure white (#FFFFFF) background.

STEP 1 — IDENTIFY THE VARIANTS IN THE SOURCE:
- The source thumbnail typically shows multiple separate variant items stacked / clustered together. They may visually overlap heavily, but they are NOT one composite — each variant is a complete independent wearable product unit (one full headband loop with its own attached character figures / decorations).
- Mentally separate the variants: count them, name each one's distinguishing feature (which character set / which color combination / which pattern).
- The output MUST contain exactly the same number of variants you identified — no more, no less. ONE of them is worn by the child model; the rest are standalone alongside.

STEP 2 — PRESERVE EVERY VARIANT EXACTLY (structural base + decorations together):
- Each variant is a COMPLETE WEARABLE PRODUCT — its structural base (headband loop / hat crown / clip body) AND all attached decorations (character figures, plush heads, antlers, stars, ribbons, springs, motifs) are ONE inseparable unit. Decorations are mounted on the base, NOT loose items.
- HARD FAILURES (forbidden):
  · Showing detached character figures floating without their headband loops / hat crowns.
  · Showing bare/empty bases without their character decorations.
  · Detaching parts from one variant and attaching them to another.
  · Substituting a "cleaner" or "simpler" version of any variant.
  · Inventing new variants that aren't in the source.
  · Dropping any variant that's in the source.
  · Including the source thumbnail as an inset, miniature, or pasted reference.
- Photorealistic preservation of every visible feature on every variant — same loop / crown shape, same character figures, same colors, same spring positions, same proportions, same surface detail.

STEP 3 — LIFESTYLE HERO LAYOUT:

3a. THE WORN HERO (one variant on a child model):
- Pick ONE variant from STEP 1 as the WORN HERO — the most visually iconic / most distinctive character set (the "default look" the buyer would identify with).
- Render a child model wearing that variant. The child is photographed head-and-shoulders crop — face fully visible, gentle natural smile, eyes open, friendly expression. Style: photorealistic, age 4–7, neutral hair / skin tone, plain soft pastel sweater (no logos, no text, no patterns).
- The CHILD'S HEAD AND THE WORN PRODUCT ARE FULLY VISIBLE inside the frame — including the topmost decoration (springs, antlers, character figures sticking up above the loop), the structural base sitting naturally on the head, and the child's face / upper torso below.
- The child + worn product occupies roughly 50–60% of the frame, positioned in the front-center as the hero focal point.
- The product sits naturally on the head — loop curves over the crown, character figures point upward on their springs, no awkward floating gap between the product and the head.
- Photorealistic portrait lighting on the child consistent with the studio look on the back-row variants.

3b. STANDALONE BACK-ROW VARIANTS (the remaining variants, NOT worn):
- The REMAINING variants (count − 1) are arranged as standalone product shots in a shallow fan / arc behind and slightly beside the child, on the same pure white background. They are NOT worn — they sit / float as product objects in studio space, each clearly identifiable.
- Each back-row variant is rendered at ~25–35% of frame height — small enough to feel "supporting" but large enough that its distinguishing decorations are recognizable.
- Each back-row variant is COMPLETE: structural base AND its character figures together as one wearable unit. No detached parts.
- Stagger the back row at slightly different heights and angles so all character figures remain visible — none occluded by the child or by neighboring variants.

3c. CRITICAL FRAMING — EVERYTHING FITS INSIDE THE FRAME:
- Maintain ≥10% safe margin on every side of the frame. The topmost decoration (on the worn hero AND on every back-row variant) sits at most 90% from the top — i.e. ≥10% empty white space above the highest spring / antler / star.
- The child's face / shoulders MUST be fully inside the frame — no cropping of forehead, hairline, or chin from the top/bottom edges.
- The whole arrangement (child + back row) fills 70–82% of the frame, with comfortable safe margins on all sides.
- If you cannot fit everything with the 10% margin at the chosen scales, REDUCE the overall arrangement until it fits. Cropping ANY decoration tip / face part / loop bottom is a HARD FAILURE.

3d. STUDIO LOOK:
- Pure white (#FFFFFF) background, completely empty — no props, no text overlays, no badges, no scene elements (table, room, holiday decor, fabric, bokeh).
- Photorealistic three-point studio lighting consistent across child and back-row variants: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating the child and the variants from the white background.
- Faint contact shadow only beneath the back-row variants. No harsh ground shadow on the child.
- Camera angle is consistent: head-and-shoulders front view of the child; back-row variants at the same eye level, just receded in depth.
- Remove any text overlays, discount badges, watermarks, lifestyle backdrops, or background objects from the source. Pure white background only.

3e. ABSOLUTELY DO NOT:
- Do NOT include the original/source thumbnail as an inset, miniature, watermark, or pasted reference anywhere.
- Do NOT add any new accessories, props, or holiday decorations not present in the source variants.
- Do NOT show the child's hands, body below the chest, or any environmental context — head-and-shoulders only on white.

Mobile legibility: at ≈200×200px the viewer must immediately read "wearable product worn by a child + multiple variants available". The worn hero anchors the use-case ("this is how it looks on a child"); the back-row variants communicate "you can choose any of these styles".`;

/** kind="box-with-loose-diff". 박스 + 다른 아이템 (윈도우 중복 X). 박스 + 클러스터 둘 다 살림. */
export const RECOMPOSE_BOX_WITH_LOOSE_DIFF_PROMPT = `Recompose this Coupang thumbnail (package box + loose items that are DIFFERENT from items inside the box) into a unified hero composition on a pure white (#FFFFFF) background. Keep the package box and every loose item exactly as shown — same shapes, colors, printed text, surface detail. Only repositioning, regrouping, and relighting are allowed.

CRITICAL — NO DUPLICATION, NO INVENTION:
- The loose items in this scenario are DIFFERENT from any items inside the box's window — keep BOTH visible. The box and the loose items together form the full bundle.
- Each unique loose item appears exactly ONCE. The box appears exactly ONCE. Do NOT invent extras.
- Do NOT redraw, recolor, or simplify any printed illustration, packaging text, or product surface detail.

Layout — box and loose items both visible, arranged as one cohesive bundle:
1. Place the package box on ONE side (back-left or back-right) at slight perspective, occupying roughly 35–45% of the frame area. Keep its window / printed face visible — the items inside the window stay as they are (since they differ from the loose items there is no duplication concern).
2. Arrange the loose items as a tight cohesive cluster on the OTHER side and slightly in front of the box, lightly overlapping the box's lower edge so the box and the loose group connect physically (not floating apart). The loose cluster fills the remaining frame area.
3. Combined arrangement fills 85–92% of the frame; visual center within 5% of geometric center.
4. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating box and items from background. Faint contact shadow beneath each element only — no cast shadow on the background.
5. Remove any scattered props, decorative elements, or text overlays outside the package itself. Pure white background.`;

/** kind="box-only-window". 박스만 + 윈도우. 박스 그대로 + 배경/오버레이 정리만. invention 위험 차단. */
export const RECOMPOSE_BOX_ONLY_WINDOW_PROMPT = `Recompose this Coupang thumbnail (package box ONLY, with a transparent display window — items visible only through the window, no loose copies outside) into a clean hero studio shot on a pure white (#FFFFFF) background. Keep the box exactly as shown — same shape, same printed graphics, same window placement, same items visible inside the window, same colors and proportions. Only repositioning, scaling, and relighting are allowed.

CRITICAL — NO INVENTION, NO EXTRACTION:
- Do NOT extract items from inside the window and place them outside the box. The items inside the window stay inside the window exactly as in the source.
- Do NOT add new loose items, accessories, or copies anywhere in the frame.
- Do NOT redraw, recolor, or simplify the box's printed graphics, text, logo, or window contents.
- The box appears exactly ONCE.

Layout:
1. Center the box so its visual weight sits within 5% of the geometric center, filling 85–90% of the frame with even margins. Keep the box's existing camera angle from the source.
2. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating the box from the background. Faint contact shadow directly beneath the box only — no cast shadow on the background.
3. Remove any scattered props, decorative elements, text overlays, watermarks, discount badges, or background objects placed outside the box itself. Pure white background, nothing else.

Mobile legibility: at ≈200×200px the box silhouette, primary brand color, and main printed graphics must remain instantly recognizable.`;

/** kind="box-only-opaque". 박스만, 윈도우 X. 박스 그대로 + 배경 정리. */
export const RECOMPOSE_BOX_ONLY_OPAQUE_PROMPT = `Recompose this Coupang thumbnail (fully opaque package box only, no transparent window, no loose items) into a clean hero studio shot on a pure white (#FFFFFF) background. Keep the box exactly as shown — same shape, same printed graphics, same colors, same logos, same proportions. Only repositioning, scaling, and relighting are allowed.

CRITICAL — NO INVENTION:
- Do NOT add loose items, accessories, or any visual element not in the source.
- Do NOT redraw, recolor, or simplify the box's printed graphics, text, or logo.
- The box appears exactly ONCE.

Layout:
1. Center the box so its visual weight sits within 5% of the geometric center, filling 85–90% of the frame with even margins. Keep the box's existing camera angle from the source.
2. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating the box from the background. Faint contact shadow directly beneath the box only — no cast shadow on the background.
3. Remove any scattered props, decorative elements, text overlays, watermarks, discount badges, or background objects. Pure white background, nothing else.

Mobile legibility: at ≈200×200px the box silhouette, primary brand color, and main printed graphics must remain instantly recognizable.`;

/** kind="lifestyle-context". 라이프스타일 씬 → 화이트 스튜디오 변환. */
export const RECOMPOSE_LIFESTYLE_PROMPT = `Recompose this Coupang thumbnail by EXTRACTING the product from its lifestyle / scene context and re-rendering it as a clean studio shot on a pure white (#FFFFFF) background. Keep the product exactly as shown in the source — same shape, same colors, same printed details, same surface texture, same camera angle. Only the background and lighting change.

CRITICAL — NO INVENTION, NO DUPLICATION:
- Identify the product (or product group) and extract it from the scene. Discard the kitchen counter, hand, table, fabric, room, outdoor backdrop, or any other lifestyle element entirely.
- Do NOT add new accessories, props, or duplicate copies of the product. Render only what was clearly the product in the source.
- Do NOT redraw, recolor, or simplify the product. Preserve every printed illustration, label, logo, or surface detail.

Layout:
1. Center the extracted product (or product group) so its visual weight sits within 5% of the geometric center, filling 85–90% of the frame with even margins. Keep the original camera angle.
2. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating the product from the background. Faint contact shadow directly beneath the product only — no cast shadow on the background.
3. Pure white background, no props, no decorative elements, no text overlays, no remnants of the lifestyle scene.

Mobile legibility: at ≈200×200px the product silhouette, dominant colors, and primary selling feature must remain instantly recognizable.`;

/** kind="text-heavy". 텍스트 / 배지 dominant → 클린업 후 상품만 hero. */
export const RECOMPOSE_TEXT_HEAVY_PROMPT = `Recompose this Coupang thumbnail by REMOVING all text overlays, discount badges, promotional graphics, watermarks, and decorative borders, and re-rendering the underlying product(s) as a clean studio shot on a pure white (#FFFFFF) background. Keep every actual product item exactly as shown in the source — same shapes, colors, printed details, surface texture, camera angle. Only the overlays and background change.

CRITICAL — NO INVENTION, NO DUPLICATION:
- Identify the actual product(s) in the source — ignore any "30% OFF" badges, sale ribbons, "BEST" stickers, lifestyle banners, frames, or graphic borders.
- Each unique product item appears exactly ONCE in the final image. Do NOT add new items, accessories, or copies.
- Do NOT redraw, recolor, or simplify the product itself. Preserve every printed illustration, label, logo, or surface detail PHYSICALLY part of the product. Only digital overlay text / badges are removed.
- If the source shows a single product → render it centered. If multiple distinct products → render them as a tight cohesive cluster (front-center hero + supporting items around).

Layout:
1. Center the cleaned product / cluster so its visual weight sits within 5% of the geometric center, filling 85–90% of the frame with even margins.
2. Photorealistic three-point studio lighting: soft key from upper-left at ~45°, gentle fill opposite, subtle rim separating items from background. Faint contact shadow beneath the product / cluster only — no cast shadow on the background.
3. Pure white background, nothing else. Absolutely no text, no badges, no promotional graphics, no decorative borders.

Mobile legibility: at ≈200×200px the product silhouette and dominant colors must remain instantly recognizable, with NO promotional text remaining anywhere in the frame.`;

/** Gemini classifier prompt. JSON 응답만 허용. 9종 시나리오 분류 + box-with-loose-same 의 변형 옵션 필요 여부. */
export const RECOMPOSE_CLASSIFY_PROMPT = `You are inspecting a Coupang product thumbnail to:
  1) classify its visual SCENARIO into ONE of 10 categories, and
  2) decide whether the user should be offered a layout-variant choice before AI editing.

## Scenario classification (mutually exclusive — pick the BEST single match)

  - "single-product"           : NO package box. ONE standalone product item only (no accessories, no multi-pack).
  - "single-with-accessories"  : NO package box. ONE main product PLUS a few small accessories / parts loose around it (cap, batteries, manual page, refill, attachment, etc).
  - "multi-pack-loose"         : NO package box. Multiple IDENTICAL or near-identical product items (3+ of same SKU shown in multiple units — e.g. 3 bottles, 5 erasers same shape).
  - "multi-variant-loose"      : NO package box. Multiple DIFFERENT product items (3+) arranged together as a set or bundle (e.g. 8 different eraser characters, 5 different toys).
  - "box-with-loose-same"      : Package box visible AND loose items in front, where the loose items DUPLICATE what is shown inside the box's transparent window (same set shown twice).
  - "box-with-loose-diff"      : Package box visible AND loose items in front, BUT the loose items are DIFFERENT from / NOT the same as items inside the box (or box is opaque). No window-duplication concern.
  - "box-only-window"          : Only a package box with a transparent display window is visible — items appear ONLY through the window, no loose copies outside the box.
  - "box-only-opaque"          : Only a fully opaque package box is visible. No transparent window, no loose items.
  - "lifestyle-context"        : Product is photographed in a lifestyle / scene context (kitchen counter, hand holding, kid playing, table setting, etc) — not a pure white studio shot.
  - "text-heavy"               : Image is dominated by text overlays / discount badges / promotional graphics — not a clean product shot.

Tie-breakers:
  - "Loose item" = any product item shown OUTSIDE its packaging.
  - Transparent display window inside a box does NOT count as a loose item; it's part of the box.
  - If lifestyle background AND clear product → "lifestyle-context" wins.
  - If text/badges dominate the frame more than the product itself → "text-heavy" wins.

## Variant choice (only meaningful when kind="box-with-loose-same")

Two layout variants exist for editing in this single case:
  - "with-box" : keep the package box and arrange loose items in front of it (box becomes supporting context)
  - "no-box"   : remove the box entirely and show only the loose items as a single hero cluster

For kind="box-with-loose-same" → requiresChoice=true (always). The window-duplication is the trigger.
For ALL OTHER 9 kinds → requiresChoice=false always.

Respond with a single JSON object, no prose, no code fences:
{
  "kind": "single-product" | "single-with-accessories" | "multi-pack-loose" | "multi-variant-loose" | "box-with-loose-same" | "box-with-loose-diff" | "box-only-window" | "box-only-opaque" | "lifestyle-context" | "text-heavy",
  "requiresChoice": boolean,
  "reasoning": "한국어 1문장, 40자 이내. 박스 유무 / 아이템 개수 / 윈도우 중복 / 배경 등 관찰."
}`;

// ─────────────────────────────────────────────────────────────
// 생성 (Generate) — 여러 입력 이미지로부터 썸네일을 합성
// ─────────────────────────────────────────────────────────────

/**
 * compose / single / bundle / color-variants 용. 순백 배경 스튜디오 샷.
 * {compositionLine} 치환: ` Product composition: "..."` 또는 `` (빈 문자열).
 */
export const GENERATE_PROMPT = `Reference images above show the target style for high-converting Coupang marketplace thumbnails.

You are given product photos labeled below.{compositionLine}

## Goal
Create a single clean e-commerce thumbnail with a pure white (#FFFFFF) background that will drive clicks in Coupang's mobile search results. Keep the product's existing camera angle as shown in the input photos.

## Background
Pure white (#FFFFFF). No gradients, textures, props, or decorative elements.

## Composition
1:1 aspect ratio. Main product centered, filling 85–90% of the frame with even margins. Visual weight within 5% of the geometric center. For a set or bundle, arrange items with tight spacing so they read as one unified subject at thumbnail size (follow the reference examples). For a boxed product, place the bare product in front and the box slightly behind and offset.

{scenarioBlock}

{layoutBlock}

## Lighting (three-point studio)
Soft key light from upper-left at ~45° producing a gentle highlight gradient. Fill light on the opposite side lifts shadows without flattening depth. Subtle rim / back light separates the product silhouette from the white background. Only a faint contact shadow beneath the product; no cast shadow on the background.

## Mobile legibility
Viewed at ≈200×200px on a phone. Silhouette, dominant colors, and the primary selling feature must remain instantly recognizable at that size. Keep critical details away from the outer 5% of the frame.

## Product identity (keep as-is)
Keep the product itself exactly as shown in the input photos — same camera angle, same material, same colors, same prints, same logos, same text on packaging, same physical proportions. Do not modify, erase, or simplify any patterns, prints, textures, graphics, or design elements physically part of the product. Do not add objects, stickers, labels, text, or decorative elements not visible in the provided photos. Only the background, composition, and lighting change.

The final result should look like a professional studio product photo suited for a top-ranking Coupang listing.`;

/**
 * creative 모드 — 씬/스타일 키워드로 아트 디렉션.
 * {productDescriptionLine} / {sceneType} / {styleType} 치환 필요.
 */
export const CREATIVE_PROMPT = `You are given product photos labeled below.{productDescriptionLine}

Create a visually striking e-commerce thumbnail with the following direction:

Scene: {sceneType}
- "white-studio": Clean studio setup with subtle shadows and professional lighting
- "lifestyle": Product placed in a natural home/lifestyle context
- "outdoor": Product in an outdoor/nature setting
- "concept": Artistic mood/concept backdrop with complementary colors

Style: {styleType}
- "minimal": Clean and minimal, focus on product
- "warm": Warm, lived-in feel with soft natural lighting
- "vivid": High-contrast, saturated product shot for maximum visibility
- "luxury": Premium feel with rich textures and dramatic lighting

{scenarioBlock}

## Framing
Keep the product's existing camera angle as shown in the provided photos. Make it the clear focal point, filling ≈70–80% of the frame so the scene can breathe. Visual center within 5% of the frame center.

## Lighting
Use a three-point-style lighting feel adapted to the chosen scene: a key light at roughly 45 degrees front-angle, softer fill on the opposite side, and a subtle rim separating the product from the backdrop. The background should complement the product, never compete with it.

## Mobile legibility
The image will be viewed at about 200×200px on a phone. The product silhouette, dominant colors, and primary selling feature must remain instantly recognizable at that size.

## Product identity (keep as-is)
Keep the product itself exactly as shown in the provided photos — same camera angle, same material, same colors, same prints, same logos, same text on packaging, same physical proportions. Only the background and lighting environment may change. Do not add objects, stickers, or decorative elements not present in the provided photos.`;

// ─────────────────────────────────────────────────────────────
// Appendix fragments — 서비스에서 런타임에 덧붙이는 조각
// ─────────────────────────────────────────────────────────────

/** 사용자 커스텀 지시 머리말. 위 프롬프트와 충돌 시 무시한다는 guard 포함. */
export const USER_PROMPT_PREFIX = 'Additional user instructions (apply only if they do not contradict the above):';

/** creative 모드에서 "Style reference" 레이블 이미지가 있을 때 붙이는 꼬리말. */
export const CREATIVE_STYLE_REFERENCE_HINT =
  '\n\nA style reference image is provided above. Match its mood, color palette, and material feel for the background.';

/** compliance 편집 시 레퍼런스 이미지 그룹 앞에 붙이는 헤더. */
export const COMPLIANCE_REFERENCE_HEADER = 'These are good examples of compliant product thumbnails:';

/**
 * compliance 편집 시 분석에서 생성된 editSuggestions 를 EDIT_PROMPT 에 덧붙이는 헤더.
 * AI 가 구체적 위반 사항을 먼저 보고, 그 다음 generic 규칙을 적용하도록 "must address first" 로 강조.
 */
export const COMPLIANCE_SUGGESTIONS_HEADER = `## Specific issues detected in this image (address these first)
The upstream compliance analysis flagged the following concrete edits. Apply them **before** the generic rules below. Do not alter the product itself — only the listed layout/background/overlay changes.
`;

/** generateFromInputs 가 레퍼런스 이미지 앞에 붙이는 헤더. */
export const GENERATE_REFERENCE_HEADER = 'Reference examples:';

/**
 * editImage 시 상품명/카테고리 컨텍스트를 prompt 최상단에 박는 헬퍼.
 * AI 가 입력 이미지를 해석할 때 "이 제품이 무엇인지" 의 baseline 인식을 가지도록.
 * 예: 머리띠 상품인데 캐릭터 부착물만 보고 "캐릭터 세트" 로 오해해서 band loop 를
 * 떼버리는 실패를 차단.
 */
export function buildProductContextHeader(
  productName: string | null | undefined,
  category: string | null | undefined,
): string {
  const name = productName?.trim();
  const cat = category?.trim();
  if (!name && !cat) return '';
  const lines: string[] = ['## PRODUCT CONTEXT (read before interpreting the image)'];
  if (name) lines.push(`- Product name: "${name}"`);
  if (cat) lines.push(`- Category: ${cat}`);
  lines.push(
    '- Use this context to identify what kind of physical product the image represents (e.g. headband, hat, shoe, toy, package). The structural base of that product type (the part the user wears, holds, or operates) MUST appear in the output, not just its decorations.',
  );
  return `${lines.join('\n')}\n\n`;
}
