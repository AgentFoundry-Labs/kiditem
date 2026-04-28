/**
 * 썸네일 프롬프트 시나리오 — 카테고리 × EditCase 매트릭스
 *
 * `thumbnail-prompts.ts` 의 GENERATE_PROMPT / CREATIVE_PROMPT 가 모든 상품에 동일하게 쓰이던
 * 기본 톤을, kiditem 주력 판매군 4종 (완구/문구/생활잡화/가구) 별로 미세 조정한다.
 *
 * 기본 원칙 (85–90% fill, #FFFFFF, mobile 200px 식별성, product identity 불변) 은 그대로.
 * 여기서 만들어지는 `scenarioBlock` 은 기본 프롬프트 안의 `{scenarioBlock}` 자리에 override 로 주입된다.
 * bucket 이 default 면 빈 문자열 → 기존 동작과 완전히 동일.
 */

export type CategoryBucket = 'toy' | 'stationery' | 'living' | 'furniture' | 'default';
export type EditCase = 'single' | 'compose' | 'color-variants' | 'bundle';

/**
 * Coupang 계층 경로 (예: `완구/취미/악기/음향기기/교재용악기/리코더/...`) 의
 * 첫 세그먼트로 bucket 결정.
 *
 * 쿠팡 대분류 중 `완구/취미`, `문구/오피스`, `가구/홈데코` 는 이름 자체에 `/` 가 포함된다 —
 * 그래서 첫 `/` 까지만 잘라서 비교하면 안 되고, 앞쪽 두 세그먼트를 합친 형태도 허용한다.
 */
export function classifyCategory(categoryPath: string | null | undefined): CategoryBucket {
  if (!categoryPath) return 'default';
  const segments = categoryPath.split('/');
  const first = segments[0];
  const firstTwo = segments.slice(0, 2).join('/');

  if (first === '완구' || first === '취미' || firstTwo === '완구/취미') return 'toy';
  if (first === '문구' || first === '오피스' || firstTwo === '문구/오피스') return 'stationery';
  if (first === '생활용품' || first === '생활잡화') return 'living';
  if (first === '가구' || first === '홈데코' || firstTwo === '가구/홈데코') return 'furniture';
  return 'default';
}

/**
 * 컨트롤러가 body 필드 존재 여부로 분기하는 로직을 함수로 추출.
 * 서비스/테스트 어디서나 동일하게 재사용 가능하게 한다.
 */
export function inferEditCase(body: {
  bundleImages?: string[] | null;
  colorImages?: string[] | null;
  packagingImage?: string | null;
}): EditCase {
  if (body.bundleImages && body.bundleImages.length > 0) return 'bundle';
  if (body.colorImages && body.colorImages.length > 0) return 'color-variants';
  if (body.packagingImage) return 'compose';
  return 'single';
}

const EMPTY_CASES: Record<EditCase, string> = {
  single: '',
  compose: '',
  'color-variants': '',
  bundle: '',
};

export const GENERATE_SCENARIO_BLOCKS: Record<CategoryBucket, Record<EditCase, string>> = {
  toy: {
    single: `## Category direction — Toy (single piece)
Emphasize playful silhouette and color saturation. If character faces or printed artwork are on the product, keep them sharp and legible at 200px. Preserve any safety / age-grade mark physically printed on the product.`,
    compose: `## Category direction — Toy (product + box)
Place the toy itself in front, the box slightly behind and offset so both the toy and the box's front face are readable. Keep the character artwork on the box sharp — box design is part of the gift-value signal.`,
    'color-variants': `## Category direction — Toy (color variants)
Arrange color variants in a tidy horizontal row or 2-row grid so each color is equally prominent. Color accuracy per variant is critical — do not blend lighting across variants.`,
    bundle: `## Category direction — Toy (bundle)
Group the bundled items tightly but with enough spacing that each individual toy stays recognizable at thumbnail size. If pieces vary in size, arrange by visual weight (largest left or center). No single hero piece should dominate.`,
  },
  stationery: {
    single: `## Category direction — Stationery (single piece)
Printed artwork, character license, or brand wordmark on the product is the primary selling feature — keep it razor-sharp and color-accurate. If the product is a flat item (notebook, sticker sheet), use a slight 10–15° tilt rather than full 45° so the cover remains largely frontal and readable.`,
    compose: `## Category direction — Stationery (item + set package)
Feature the main item clearly in front; place the set package or its label behind. The package usually carries the license art or title — keep that text readable.`,
    'color-variants': `## Category direction — Stationery (color / design variants)
Each variant's cover art must stay individually legible. Lay variants flat-on in a grid so each design is viewed head-on, not at an angle.`,
    bundle: `## Category direction — Stationery (bundle / set)
Arrange bundle items so each printed design or character is distinguishable. If items are a matched set (notebook + pencil case + stickers), group them as if on a desk, items slightly overlapping but primary designs fully visible.`,
  },
  living: {
    single: `## Category direction — Living goods (single piece)
Pick a camera angle that exposes the functional feature (e.g. strap for a hat, wheels for a toy vehicle, craft surface for DIY kit). Preserve material texture — foam, fabric, plastic finish — since buyers inspect it to judge price-value.`,
    compose: `## Category direction — Living goods (product + package)
Place product in front, retail package behind. If the package shows usage illustrations or size chart, keep those readable — they answer buyer questions.`,
    'color-variants': `## Category direction — Living goods (color variants)
Show all variants at the same angle so the only difference the eye catches is color / finish. Uniform lighting across variants.`,
    bundle: `## Category direction — Living goods (bundle)
Arrange as a flat-lay or loose stack hinting at "set value". Each item should still be individually countable at 200px.`,
  },
  furniture: {
    single: `## Category direction — Furniture / Home decor (single piece)
Preserve the product's base, pot, or stand fully — cropping the bottom destroys stability cues. For organic items (grass figures, plants), keep texture fully visible, avoid over-smoothing.`,
    compose: `## Category direction — Furniture / Home decor (product + packaging)
Product in front, packaging behind. Packaging for decor items often shows install / care instructions — keep that text readable.`,
    'color-variants': `## Category direction — Furniture / Home decor (color variants)
Line variants up on a single baseline (as if on a shelf) so the eye reads them as a coordinated collection.`,
    bundle: `## Category direction — Furniture / Home decor (bundle)
Arrange as if styled on a shelf or tabletop, maintaining negative space between items — decor bundles sell through visual harmony, not density.`,
  },
  default: EMPTY_CASES,
};

export const CREATIVE_SCENARIO_BLOCKS: Record<CategoryBucket, string> = {
  toy: `## Category direction — Toy / Hobby
Children are the end user; adults (parents) are the buyer. Emphasize playful character of the product: rounded silhouettes, color saturation that reads as joyful (not garish), and a hint of scale-to-hand or scale-to-child so the viewer intuits size. If a safety or age-grade mark is physically on the product, keep it fully visible. For musical instruments, preserve wood grain, key layout, and brand engraving sharply — these are trust signals for parents.`,
  stationery: `## Category direction — Stationery / Office
The selling feature is usually a printed design, character license (e.g. Pokémon, Sanrio), or paper / surface quality. Keep printed text, logos, and character artwork on the product razor-sharp and color-accurate — this is the primary purchase driver. Avoid backgrounds that clash with the product's own cover art. If multiple notebooks or items have slight design variations, each must remain individually readable at 200px.`,
  living: `## Category direction — Living / Miscellaneous
These are practical novelty items (e.g. EVA animal hats, robot bug toys, color-your-own gliders). Hint at how the product is used without adding props: choose a camera angle that exposes the functional part (strap for a hat, wheels for a vehicle, craft surface for DIY). Preserve texture fidelity of foam, plastic, fabric — these categories are price-sensitive and buyers inspect material quality closely.`,
  furniture: `## Category direction — Furniture / Home decor
These items sell through atmosphere. In "lifestyle" / "concept" scenes, place the product within a believable domestic setting (shelf, window ledge, tabletop) but keep it the clear focal point occupying 70–80% of frame. Preserve the product's base / pot / stand fully — cropping the bottom destroys stability cues. For organic items (e.g. 잔디인형), keep texture of grass/moss fully visible; avoid over-smoothing.`,
  default: '',
};

export function buildGenerateScenarioBlock(bucket: CategoryBucket, editCase: EditCase): string {
  return GENERATE_SCENARIO_BLOCKS[bucket]?.[editCase] ?? '';
}

export function buildCreativeScenarioBlock(bucket: CategoryBucket): string {
  return CREATIVE_SCENARIO_BLOCKS[bucket] ?? '';
}
