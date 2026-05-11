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

## Background (default — user instructions override)
**Default**: pure white (#FFFFFF), no gradients, textures, props, or decorative elements.

**If USER INSTRUCTIONS below specify a different background** (e.g. interior mood, themed scene, lifestyle context, dim/dark ambient), FOLLOW the user's scene instead. The default white background is only the fallback when no scene is specified.

## Composition (MANDATORY scale rule — overrides source image scale)
1:1 aspect ratio. Main product centered.

**PRIORITY ORDER — apply top-down on every conflict**:

1. **SEPARATION FIRST**:
   - N ≤ 3 → NO overlap, NO touching. ~3–8% clean gaps.
   - N = 4–6 → minimal edge overlap (≤ 5%).
   - N = 7+ → tight overlap allowed only when space runs out.

2. **TARGET 80% combined fill (drop to 75% before allowing overlap)**:
   - Target combined bounding box = 80% on both axes.
   - Scale each product LARGE + spread WIDE across frame.
   - **If 80% forces overlap → DROP TO 75%** (no overlap >> tight fill).
   - **Hard floor 75%** — never below.

3. SINGLE product (N=1): ≥ 80% both axes, target 85–95%.

Visual weight within 5% of the geometric center.

**Camera horizon — strictly level**:
- Camera is perfectly horizontal. NO Dutch tilt, NO rotation, NO oblique angle. Frame edges are perpendicular to the world.
- The surface the product(s) sit on (table / floor / shelf) reads as a STRAIGHT horizontal line across the frame.
- Vertical elements in the scene (walls, doorframes, vertical product axes) are EXACTLY vertical — not slightly leaning.
- All products in a multi-product shot sit on the SAME horizontal base line — their bottoms align at the same Y coordinate. NO staggered heights.

**Vertical framing — NO cropping at top or bottom**:
- The top of the tallest product must sit at most ~92% from the bottom (i.e. ≥ 5–8% empty margin above the highest tip). NEVER let the tip reach the top edge.
- The bottom (base) sits at most ~92% from the top (≥ 5–8% margin below). NEVER let the base reach the bottom edge.
- Same horizontal margin: ≥ 3–5% on left and right.
- If the product is tall (e.g. tree, lamp), prioritize fitting the FULL HEIGHT in frame even if that means slightly less width fill.

**SCALE OVERRIDE — critical**: regardless of how the product appears in the source/input images (small, off-center, lots of empty background around), the OUTPUT MUST aggressively scale the product UP to fill 90–95% of the frame. Source's small placement is NOT a constraint — it's identity reference, not target size. Imagine zooming the source product so it almost touches all four frame edges.

For lifestyle/interior scenes (user-requested theme), fill **88–93%** — product overwhelmingly dominant, background scene compresses to a thin border (5–10%) around it. For pure white-studio shots (no scene specification), fill **90–95%**. Minimum acceptable fill is 88% — less and the product looks lost; Coupang penalizes it.

For a set or bundle, arrange items with tight spacing so they read as one unified subject at thumbnail size (follow the reference examples). For a boxed product, place the bare product in front and the box slightly behind and offset.

{scenarioBlock}

{layoutBlock}

## Lighting (three-point studio)
Soft key light from upper-left at ~45° producing a gentle highlight gradient. Fill light on the opposite side lifts shadows without flattening depth. Subtle rim / back light separates the product silhouette from the white background. Only a faint contact shadow beneath the product; no cast shadow on the background.

## Mobile legibility
Viewed at ≈200×200px on a phone. Silhouette, dominant colors, and the primary selling feature must remain instantly recognizable at that size. Keep critical details away from the outer 5% of the frame.

## ⚠️ Product identity — SACRED, pixel-level preservation
This is the SINGLE MOST IMPORTANT rule. The product itself is NOT yours to modify. Reproduce it from the input photos with zero alteration:
- Same shape, silhouette, geometry, proportions
- Same colors, color combinations, saturation level
- Same printed graphics, illustrations, characters, text on packaging, surface patterns
- Same logos, brand marks, sticker placement
- Same material appearance (matte / glossy / transparent / metallic — exactly as shown)
- Same camera angle relative to source (frontal → frontal, 3/4 → 3/4)

Forbidden modifications (these are HARD failures, even if they "look better"):
- "Cleaning up" or "simplifying" busy patterns / textures / prints
- Adding decorations, accessories, attachments not in source
- Removing existing decorations, prints, logos
- Substituting "similar" elements (swapping a winking santa for a smiling one is NOT preserving)
- Color-correcting the product itself (background lighting can match scene, but the product's actual color stays exact)

⚠️⚠️ **MULTI-PRODUCT SOURCE — NO NEW INVENTION, EVER**:

If the source contains multiple distinct items (e.g. 11 pencil cases with characters "Zoozoo Chicken", "Nice Flamingo", "My dream elephant", "Zoozoo Cat", "Because I'm Nice", etc.), output MUST contain EXACTLY those same items. Forbidden:

- Inventing NEW characters/items not in source (e.g. adding "Panda" pencil case when no panda in source)
- Swapping items (e.g. "Zoozoo Chicken" → "Panda", or "My dream elephant blue" → "different elephant green")
- Reducing item count (if source has 11, output has 11)
- Adding extras (if source has 11, output has 11)
- Generating "similar style" filler items

User's "rearrange / 정렬 / make it look better" means **repositioning the SAME source items**, NOT generating new ones. The source items are the ONLY valid items. Same character names, same printed texts, same color patterns, exactly.

You CAN change: background, scene context, lighting (the studio setup or interior ambient), composition (where the product sits in frame, how it's scaled). You CANNOT change: the physical product object(s) themselves.

Treat each product like a real physical thing photographed. The things themselves don't change between shoots — only their arrangement and the environment around them.

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

/**
 * 사용자 커스텀 지시 머리말.
 *
 * **사용자 입력은 위 default 룰을 OVERRIDE 한다** — 특히 background / mood / lighting 관련
 * 사용자 지시가 있으면 default "Pure white #FFFFFF studio" 룰을 무시하고 사용자 의도를 따른다.
 *
 * 예: 사용자가 "크리스마스 거실 무드 컷" 요청 → 흰 스튜디오 룰 무시 + 거실 인테리어 무드 컷 생성.
 *
 * 단 product identity (camera angle / colors / prints / logos / surface detail) 는 사용자
 * 지시에 관계없이 항상 보존 (변형 안 됨).
 */
export const USER_PROMPT_PREFIX = `## USER INSTRUCTIONS — these OVERRIDE the default rules above (especially for background, mood, lighting, and scene context).

If the user's instructions describe a specific background scene (e.g. "크리스마스 거실 무드 컷", "캠핑 야외", "침실 무드"), FOLLOW the user's scene instead of the default white-studio background. The "Pure white #FFFFFF" rule is a fallback for products with no scene specification — user-specified scenes take priority.

If the user's instructions request a photographic mood (e.g. "사실적 인테리어", "CGI 아닌 실제 카메라 톤"), apply that aesthetic instead of the default studio look. Add depth-of-field, natural interior lighting, soft bokeh, and dim ambient as the user specifies.

⚠️ **PRODUCT IDENTITY IS SACRED — pixel-level preservation, ABSOLUTE rule that overrides EVERYTHING (including user instructions)**

The product itself MUST be reproduced from the source image with zero modification. This is the single most important rule. Specifically forbidden:
- Changing the product's shape, silhouette, geometry, or proportions
- Changing the product's colors, color combinations, or color saturation
- Changing the product's printed graphics, illustrations, characters, text, or surface patterns
- Changing the product's logos, brand marks, label printing, or stickers physically present on the product
- Changing the product's material appearance (matte→glossy, transparent→opaque, etc.)
- Changing the product's camera angle relative to the source (frontal stays frontal, 3/4 stays 3/4)
- Adding decorations, accessories, attachments, or stickers that aren't on the source product
- Removing existing decorations, prints, logos, or design elements
- "Cleaning up" or "simplifying" the product surface — even busy patterns must be preserved exactly
- Substituting "similar" elements (e.g. swapping winking santa for smiling santa, changing reindeer color)

⚠️⚠️ **MULTI-PRODUCT SOURCE — NO NEW INVENTION, EVER**:

If the source shows multiple distinct products (e.g. 11 different pencil cases with different characters: "Zoozoo Chicken", "Nice Flamingo", "My dream elephant", "Zoozoo Cat", "Because I'm Nice", etc.), the OUTPUT MUST contain EXACTLY THOSE SAME ITEMS. Specifically forbidden in multi-product cases:

- Inventing NEW characters not in the source (e.g. adding a "Panda" pencil case if there's no panda in source)
- Swapping characters (e.g. replacing "Zoozoo Chicken" with "Panda", or "My dream elephant blue" with "My dream elephant green")
- Changing color combinations (e.g. blue stripe → red stripe pattern)
- Reducing to fewer items (if source has 11, output has 11 — no dropping)
- Adding more items (if source has 11, output has 11 — no inventing extras)
- Generating "similar style" items as filler

Each item in the OUTPUT must be a one-to-one copy of an item in the SOURCE. Same character. Same printed text. Same color. Same fabric pattern. Same proportions. The user's "rearrange" or "정렬" instruction means **rearranging the SAME items**, NOT creating new ones.

When user says "정렬해줘" or "make it look better" or any vague restyling instruction, the SOURCE items are still the only valid items. Re-position them, scale them, light them differently — but the items themselves are the source items, exactly as photographed.

If the user instruction conflicts with product preservation (e.g. user says "make it red" but product is blue), the product wins — render it blue per source. The user instruction applies to background, mood, lighting, scene context — NEVER to the product itself.

The user's role: define the SCENE around the product. NOT to alter the product. Treat the product like a real physical object — you can change where it sits, what's around it, how it's lit — but you cannot reach in and modify the object.

Other rules that also survive user instructions:
- Coupang policy: no text overlays / discount badges / watermarks added on top
- Mobile legibility (~200×200px) — product silhouette must remain recognizable
- **PRIORITY ORDER — apply top-down on every conflict**:

  1. **SEPARATION FIRST** (highest priority). Products NEVER overlap when count is small:
     - N ≤ 3 → NO overlap, NO touching. ~3–8% clean gaps between adjacent products.
     - N = 4–6 → minimal edge overlap (≤ 5%).
     - N = 7+ → tight overlap allowed only when space genuinely runs out.

  2. **TARGET 80% combined fill** (second priority — but NEVER violate rule 1):
     - Target: combined bounding box (smallest rectangle containing all products) covers 80% of frame on both axes.
     - Achieve this by scaling each product LARGE and SPREADING them wide across the frame.
     - **If achieving 80% would force overlap → DROP TO 75% combined fill**. 75% with no overlap >> 80% with overlap. The frame can have slightly more breathing space — that is acceptable.
     - **Hard floor: 75% combined fill on each axis. Never below 75%.**

  3. **Single product** (N=1) → bounding box ≥ 80% on both axes (no separation conflict possible). Target 85–95%.

  Source image's small scale is IRRELEVANT — output MUST scale up to fill 75–80%+ regardless of source. Source = identity reference, not size reference.

  Background must NOT contain scale-reference objects (other products, furniture, sized props, people) — only blurred mood / bokeh / color. The product is the ONLY measurable thing.
- Visual center within 5% of geometric center (or rule-of-thirds in a lifestyle scene per user request)

User instructions (apply ONLY to background / mood / lighting / scene — NEVER to the product itself):`;

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
