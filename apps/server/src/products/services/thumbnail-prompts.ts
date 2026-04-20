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
// 분석 (Analysis) — Gemini `gemini-3.1-flash-lite-preview` 기본 모델로 호출
// ─────────────────────────────────────────────────────────────

/** 쿠팡 대표이미지 정책 12항목 준수 여부 판단. {productList} 치환 필요. */
export const COMPLIANCE_PROMPT = `당신은 쿠팡 대표이미지 정책 심사관입니다.
아래 상품 썸네일 이미지를 각각 가이드라인 12항목 준수 여부를 판단하고, 이미지 순서대로 JSON 배열로 응답하세요.

## 가이드라인 12항목
1. background_not_white: 배경이 순백색(RGB 255,255,255)이 아님
2. has_text: 상품 위에 포토샵 등으로 텍스트/카피를 덧붙인 경우만 위반. 상품 자체에 원래 인쇄·각인·자수된 브랜드명, 로고, 라벨 등은 위반이 아님
3. has_extra_logo: 이미지 편집으로 추가한 로고/인증마크/워터마크. 상품 자체에 원래 있는 브랜드 로고는 위반이 아님
4. has_discount_text: 할인율/프로모션/가격 문구
5. has_freebie_display: 사은품/증정품/덤 표시
6. has_overlay_effects: 그림자/테두리/장식/프레임 효과
7. has_gradient_background: 배경에 그라데이션/텍스처/패턴
8. has_background_objects: 배경에 소품/오브젝트 배치
9. product_fill_low: 상품이 이미지 면적의 85% 미만 차지
10. not_center_aligned: 상품의 무게 중심이 이미지 중앙에서 크게(10% 이상) 벗어난 경우만 위반. 약간의 편차는 허용
11. product_cropped: 상품 일부가 이미지 밖으로 잘림
12. excessive_editing: 과도한 색보정/합성으로 실물과 괴리

상품 정보:
{productList}

응답 형식 (JSON 배열만 출력):
[
  {
    "index": 0,
    "violations": { "background_not_white": false, "has_text": false, ... },
    "confidence": { "background_not_white": 95, ... },
    "quality": { "estimatedFillPercent": 90, "centerOffsetPercent": 2, "aspectRatioValid": true }
  }
]`;

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
// 편집 (Edit) — 기존 썸네일 1장을 image-gen (`gemini-3.1-flash-image-preview`) 으로 변형
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

/** generateFromInputs 가 레퍼런스 이미지 앞에 붙이는 헤더. */
export const GENERATE_REFERENCE_HEADER = 'Reference examples:';
