import type { DetailPageAgeGroup } from './prompts/detail-page/types';

interface DetailPageMediaPromptBaseInput {
  organizationId?: string;
  productName: string;
  category: string;
  description: string;
  options: string;
  imageUrls?: string[];
  ageGroup?: DetailPageAgeGroup;
}

interface GenerateHeroBannerPromptInput extends DetailPageMediaPromptBaseInput {
  templateId: 'kids-playful' | 'bold-vertical';
  headline: string;
  subhead: string;
}

interface GenerateSizeGuidePromptInput extends DetailPageMediaPromptBaseInput {
  heightLabel?: string;
  widthLabel?: string;
}

interface GenerateDetailSectionPromptInput extends GenerateSizeGuidePromptInput {
  variant?: number;
}

interface GenerateUsageGuidePromptInput extends GenerateDetailSectionPromptInput {
  usageStep?: string;
}

interface InferColorPromptInput {
  productName: string;
  category: string;
  description: string;
  options: string;
}

export function buildHeroBannerPrompt(input: GenerateHeroBannerPromptInput): string {
  const audience = describeAudience(input.ageGroup);
  const style = describeAudienceStyle(input.ageGroup);
  const tone = input.templateId === 'bold-vertical'
    ? `bright Korean ${style} detail page hero, soft premium studio mood, playful but clean`
    : `energetic Korean ${style} trend-detail hero, fun lifestyle mood, vivid but polished`;

  return [
    'Create one wide ecommerce detail-page hero banner image.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    `Target age/audience: ${audience}`,
    `Headline mood: ${input.headline}`,
    `Subhead: ${input.subhead}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    '',
    'Composition requirements:',
    `- Mood/style: ${tone}.`,
    '- Use the provided product photos as the exact product reference.',
    '- Preserve the product shape, colors, materials, and recognizable details as much as possible.',
    '- Generate a NEW matching background scene or styled backdrop that fits the product mood. If people or lifestyle hints appear, follow the target age/audience exactly.',
    describePeopleRule(input.ageGroup),
    '- Do NOT paste, crop, enlarge, or reuse the original uploaded photo as the whole banner.',
    '- Do NOT use a raw package/display-box photo as the banner. Package can be referenced for product identity only.',
    '- The final banner must clearly look like a generated commercial hero image with a fresh background and intentionally staged product.',
    '- Keep the product large, centered, and fully visible inside the safe center area.',
    '- Use a clean 16:9 wide composition suitable for the very top of a Korean mobile product detail page.',
    '- Do not add Korean text, English text, logos, watermarks, price badges, labels, or UI elements inside the image.',
    '- Avoid cropping off important product parts.',
    '- Photorealistic commercial product shot, not a flat illustration.',
  ].filter(Boolean).join('\n');
}

export function buildColorGuidePrompt(input: GenerateDetailSectionPromptInput): string {
  const audience = describeAudience(input.ageGroup);
  const style = describeAudienceStyle(input.ageGroup);
  return [
    'Create one ecommerce detail-page color/options guide image.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    `Target age/audience: ${audience}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    '',
    'Composition requirements:',
    '- This image will be placed ONLY in the "색상 안내" section of a Korean product detail page.',
    '- Use the provided product photos as the exact product reference.',
    '- If the references visibly contain multiple color variants, arrange all real visible variants in a clean horizontal row or gentle diagonal group.',
    '- If only one product photo is available, create a fresh composition of the same real product using a new angle/background; do not invent unsupported colors.',
    '- If Options/specs explicitly says "색상 구성: 단일 색상", keep it as a single-color guide and do not invent extra variants.',
    '- If Options/specs explicitly says "색상 구성: 여러 색상", include only visible real product variants from the references.',
    '- Do not add color names, callout labels, Korean text, English text, icons, arrows, badges, or captions inside the image. The HTML template will render all text separately.',
    '- Never use a package box, display box, barcode/KC/safety label, size chart, instruction sheet, or unrelated prop as the main subject.',
    '- Preserve real product colors and printed artwork. Do not merge colors or change the product identity.',
    `- Use a bright polished background suitable for ${style}, with enough contrast for the product.`,
    '- No prices, discount badges, shop logos, watermarks, or text of any kind.',
    '- Photorealistic commercial product composition, not a flat illustration.',
  ].filter(Boolean).join('\n');
}

export function buildColorSubtitlePrompt(input: InferColorPromptInput): string {
  return [
    'Look at the provided product photos and infer the REAL visible product color variants.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    input.description ? `Product notes: ${input.description}` : '',
    input.options ? `Seller options/spec hints: ${input.options}` : '',
    '',
    'Return JSON only: {"subtitle":"..."}',
    '',
    'Rules:',
    '- The subtitle must be Korean and fit a Korean ecommerce color section.',
    '- Use visible product colors from the photos as the source of truth. Do not trust seller options/spec hints when they conflict with the image.',
    '- If Seller options/spec hints explicitly says "색상 구성: 단일 색상", return a single-color subtitle unless the photos clearly show separate real variants.',
    '- If Seller options/spec hints explicitly says "색상 구성: 여러 색상", still list only colors that are visible on real products in the photos.',
    '- Prefer natural Korean color names such as 민트, 그린, 초록, 핑크, 옐로우, 노랑, 오렌지, 블랙, 화이트.',
    '- If a variant is mint/green, do NOT call it blue/블루.',
    '- Exclude package box colors, KC/safety label colors, background colors, text print colors, shadows, and lighting artifacts.',
    '- If multiple variants are visible, format like "민트 / 핑크 / 옐로우 3가지 색상".',
    '- If only one visible product color exists, format like "핑크 단일 색상".',
    '- If colors are impossible to judge, use "상품 이미지 기준 색상 확인".',
    '- Keep subtitle under 40 Korean characters if possible.',
  ].filter(Boolean).join('\n');
}

export function buildColorImageSelectionPrompt(input: InferColorPromptInput): string {
  return [
    'Choose which uploaded images should be used in the "색상 안내" section of a Korean ecommerce detail page.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    input.description ? `Product notes: ${input.description}` : '',
    input.options ? `Seller options/spec hints: ${input.options}` : '',
    '',
    'Return JSON only: {"mode":"combined|separate|single","imageIndices":[number, ...]}',
    '',
    'Decision rules:',
    '- Use the visual content of the images as the source of truth.',
    '- If Seller options/spec hints explicitly says "색상 구성: 단일 색상", return mode "single" with only the clearest product color image unless multiple real product variants are visibly separate.',
    '- If Seller options/spec hints explicitly says "색상 구성: 여러 색상", verify that the variants are visible before choosing multiple images.',
    '- If there are clean individual product photos for each real color variant, choose those individual images, one per visible variant.',
    '- If the variants are not separated and one image already shows the visible colors together, choose ONLY that one combined image.',
    '- If both a combined lineup and enough individual color photos exist, prefer the individual color photos.',
    '- Never mix a combined lineup image with the individual variant images in the same result.',
    '- Exclude package/display boxes, KC/safety labels, barcodes, instruction sheets, size guides, hands-only crops, lifestyle scenes, and unrelated props.',
    '- Do not choose images based on package/background colors. Only product body/cap/variant colors count.',
    '- Keep the result concise: one combined image OR 2-6 individual variant images.',
    '- If color variants are impossible to judge, return the single clearest product color image.',
  ].filter(Boolean).join('\n');
}

export function buildPackageImagePositionsPrompt(): string {
  return [
    'Classify which candidate images are primarily retail packaging, package boxes, display boxes, outer cartons, or product-in-box composition photos.',
    'Return JSON only: {"packageCandidateIndices":[number, ...]}',
    '',
    'Rules:',
    '- Use the exact candidateIndex numbers shown before each image.',
    '- Include images where a package/display box is a visible main subject or large supporting subject.',
    '- Include open retail display boxes, boxed sets, outer product boxes, or photos where the product is shown together with its box.',
    '- Do NOT include ordinary product-only images, color variant lineups without packaging, size guide images, usage/detail close-ups, safety/KC labels, barcodes, or instruction sheets.',
    '- Do NOT classify a product as packaging just because the physical product itself is box-shaped.',
    '- If unsure, leave it out.',
  ].join('\n');
}

export function buildDetailCutPrompt(input: GenerateDetailSectionPromptInput): string {
  const variant = input.variant ?? 1;
  const audience = describeAudience(input.ageGroup);
  const style = describeAudienceStyle(input.ageGroup);
  const variantDirection = variant % 2 === 0
    ? 'Show a usage/detail moment such as a hand interaction, opening, button, texture, functional part, or close-up feature. Keep it clean and product-focused.'
    : 'Show a polished product detail composition that highlights shape, material, print, set contents, or an alternate angle. Keep the product large and inspectable.';

  return [
    'Create one ecommerce detail-page supporting image.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    `Target age/audience: ${audience}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    '',
    'Composition requirements:',
    '- This image will be placed ONLY in the "DETAIL" section of a Korean product detail page.',
    '- IMAGE-ONLY OUTPUT: not a callout card, poster, infographic, or designed text panel.',
    '- Do not create a "DETAIL FEATURE CALLOUT" design. The template supplies all headings and captions separately.',
    `- ${variantDirection}`,
    '- Use the provided product photos as the exact product reference.',
    '- Never design a new product, new shape, new character, or new package. Only restage the same product from the references.',
    '- If source images are too few, create a new camera composition/background from the same product instead of repeating the same crop.',
    '- Vary the composition from previous sections: use a different crop, zoom level, camera angle, or product placement while keeping the product recognizable.',
    '- Prefer enlarged product composition shots that make the product easier to inspect, not another full duplicate of the uploaded photo.',
    '- Preserve product shape, proportions, colors, printed artwork, materials, and important physical details.',
    '- Do not render the product name inside this image.',
    '- No Korean text, English text, numbers, fake KC marks, barcodes, certifications, brand logos, prices, watermarks, or long text.',
    '- Avoid package boxes as the main subject unless the input photo clearly shows the package and the detail page needs a 구성/패키지 컷.',
    `- Use a clean bright ${style} ecommerce look, with the product fully visible and not awkwardly cropped.`,
    describePeopleRule(input.ageGroup),
    '- Photorealistic commercial product shot, not a flat illustration.',
  ].filter(Boolean).join('\n');
}

export function buildUsageGuidePrompt(input: GenerateUsageGuidePromptInput): string {
  const variant = input.variant ?? 1;
  const audience = describeAudience(input.ageGroup);
  const style = describeAudienceStyle(input.ageGroup);
  return [
    'Create one ecommerce product usage photo.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    `Target age/audience: ${audience}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    input.usageStep ? `Usage step reference: ${input.usageStep}` : '',
    '',
    'Composition requirements:',
    '- IMAGE-ONLY OUTPUT: create only a clean product photo showing the action.',
    '- Do not create an instruction card, tutorial panel, app UI, label sheet, or infographic.',
    '- Do not render "사용법 안내", step numbers, Korean text, English text, icons, arrows, captions, badges, or labels inside the image.',
    '- Use the provided product photos as the exact product reference.',
    '- Preserve product shape, proportions, colors, printed artwork, and materials.',
    '- Show a realistic hand interaction only if it helps explain the step; use natural short nails, no manicure, no nail polish.',
    describePeopleRule(input.ageGroup),
    `- Variant ${variant}: choose a slightly different camera angle or hand position while keeping the product inspectable.`,
    `- Clean bright ${style} ecommerce look, photorealistic, no illustration.`,
  ].filter(Boolean).join('\n');
}

export function buildSizeGuidePrompt(input: GenerateSizeGuidePromptInput): string {
  const orientation = describeSizeGuideOrientation(input);
  const audience = describeAudience(input.ageGroup);

  return [
    'Create one isolated product cutout image for an ecommerce size guide.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    `Target age/audience: ${audience}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    '',
    'Composition requirements:',
    '- HARD REQUIREMENT: output exactly ONE single product unit only, enlarged and centered.',
    '- Gemini must choose/isolate one product unit from the references and create a new centered size-guide image. Do not simply reuse an uploaded crop.',
    '- If the references show multiple color variants, choose the clearest front-facing single unit, preferably the center/default variant, and remove every other unit.',
    '- If there is no single-unit source photo, isolate one representative unit from a group photo and reconstruct it as a clean single-product cutout.',
    '- Never output a group photo, multi-color lineup, package box, display box, hand, or lifestyle scene.',
    '- Remove all duplicate units, packaging boxes, hands, props, lifestyle backgrounds, text overlays, logos added by AI, badges, and measurement labels.',
    '- Preserve the real product shape, colors, printed illustrations, materials, and proportions as much as possible.',
    '- The product must be fully visible, exactly centered, and large enough to read size clearly.',
    orientation,
    '- Match the product visual orientation to the measurement labels. Do not rotate a wide product upright, and do not lay down a tall product sideways.',
    '- The template will draw the height label on the left vertical guide and the width label on the bottom horizontal guide, so the generated product silhouette must agree with those axes.',
    '- Crop tightly around the product with only small clean padding. Do not place the product inside a large square canvas.',
    '- The product should fill most of the image height, with no more than about 6% empty margin after cropping.',
    '- Output a clean transparent-background PNG cutout if supported.',
    '- If transparency is unavailable, use a pure white (#FFFFFF) border-connected background only so the application can remove it. Do not leave an inner white rectangle or photo card behind the product.',
    '- Remove every background pixel around the product silhouette. The final product should visually sit directly on the template background after trimming.',
    '- Absolutely do not add measurement lines, arrows, rulers, dimension text, or numbers. The template will overlay measurement guides separately.',
    '- Photorealistic product-only studio cutout, not an illustration.',
  ].filter(Boolean).join('\n');
}

function describeAudience(ageGroup?: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') {
    return '14+ product for middle/high-school students and teenagers; not young children';
  }
  return '8+ product for elementary-school-age children; not toddlers or preschoolers';
}

function describeAudienceStyle(ageGroup?: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') return 'teen/student-product';
  return 'kids-product';
}

function describePeopleRule(ageGroup?: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') {
    return [
      '- If a person, hands, or lifestyle use scene appears, depict a middle/high-school aged teenager or student.',
      '- Do NOT depict a preschool child, elementary-looking child, toddler, baby, or childish nursery/playroom cues.',
    ].join('\n');
  }
  return '- If a person, hands, or lifestyle use scene appears, keep them elementary-school age or older; do not depict toddlers or babies.';
}

function describeSizeGuideOrientation(input: GenerateSizeGuidePromptInput): string {
  const width = parseDimensionLabel(input.widthLabel);
  const height = parseDimensionLabel(input.heightLabel);
  if (width === null || height === null || width === height) {
    return '- Keep the product in its natural front-facing orientation from the reference photos.';
  }
  if (width > height) {
    return [
      `- HARD REQUIREMENT: ${input.widthLabel} is the horizontal width and ${input.heightLabel} is the vertical height.`,
      '- The final product silhouette must be visibly wider than tall, like a landscape rectangle.',
      '- Do not stand the product upright or make it appear taller than its width.',
    ].join('\n');
  }
  return [
    `- HARD REQUIREMENT: ${input.heightLabel} is the vertical height and ${input.widthLabel} is the horizontal width.`,
    '- The final product silhouette must be visibly taller than wide, like a portrait rectangle.',
    '- Do not rotate the product sideways or make it appear wider than its height.',
  ].join('\n');
}

function parseDimensionLabel(label: string | undefined): number | null {
  if (!label) return null;
  const match = label.trim().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toLowerCase();
  if (unit === 'm') return value * 1000;
  if (unit === 'cm') return value * 10;
  return value;
}
