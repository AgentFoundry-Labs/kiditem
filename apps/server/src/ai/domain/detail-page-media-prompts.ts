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
    `Hero copy context for mood only (DO NOT render as text): ${input.headline}`,
    `Supporting copy context for mood only (DO NOT render as text): ${input.subhead}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    '',
    'TEXT-FREE HERO BANNER HARD RULE:',
    '- The generated hero banner bitmap must contain ZERO readable text. This overrides every other instruction.',
    '- Do NOT render the product name, headline, subhead, slogan, Korean text, English text, letters, numbers, speech bubbles, captions, labels, logo-like typography, price badges, watermarks, UI text, or decorative type inside the image.',
    '- The headline/subhead above are only semantic mood references for the separate HTML template. They must never appear visually in the generated image.',
    '- If the model is tempted to add lettering, replace that area with clean background, product, props, lighting, texture, or empty safe space for later HTML text overlay.',
    '',
    'Composition requirements:',
    `- Mood/style: ${tone}.`,
    '- This is an image-generation/recomposition task. Use the uploaded photos as product references, then synthesize a new staged hero photo.',
    '- SINGLE PHOTO ONLY: output one continuous photorealistic camera shot. No split screen, before/after comparison, collage, side-by-side layout, grid, poster panel, product sheet, or multi-frame composition.',
    '- Use the provided product photos as the exact product reference.',
    studioProductPreservationRules(),
    '- Preserve the product shape, colors, materials, and recognizable details as much as possible.',
    '- Generate a NEW matching background scene or styled backdrop that fits the product mood.',
    '- PERSON POLICY: prefer a product-only staged hero scene with no visible people, no faces, no children, and no full bodies. Do not add child models just because the product is for kids.',
    '- If a human interaction is absolutely needed to explain scale or use, show at most ONE cropped hand/forearm at the edge of the frame, never two hands, never faces, never full bodies.',
    '- For 14+ products, any visible hand/forearm must read as teen/student or adult; never show an elementary-looking child or child lifestyle scene.',
    describePeopleRule(input.ageGroup),
    '- Do NOT paste, crop, enlarge, lightly retouch, or reuse the original uploaded photo as the whole banner.',
    '- Do NOT use a raw package/display-box photo as the banner. Package can be referenced for product identity only.',
    '- The final banner must clearly look like a generated commercial hero image with a fresh background and intentionally staged product.',
    '- Keep the product large, centered, and fully visible inside the safe center area.',
    '- Use a clean 16:9 wide composition suitable for the very top of a Korean mobile product detail page.',
    '- Again: no Korean text, no English text, no logo typography, no watermarks, no price badges, no labels, no captions, and no UI elements inside the image.',
    '- Avoid cropping off important product parts.',
    '- Photorealistic commercial product shot, not a flat illustration.',
  ].filter(Boolean).join('\n');
}

export function buildHeroProductImagePrompt(input: DetailPageMediaPromptBaseInput): string {
  const audience = describeAudience(input.ageGroup);
  const style = describeAudienceStyle(input.ageGroup);

  return [
    'Create one product-focused studio packshot for the top product image area of an ecommerce detail page.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    `Target age/audience: ${audience}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    '',
    'TOP PRIORITY (overrides every other rule, including any "hand allowed" hints elsewhere): this is a HAND-FREE, PEOPLE-FREE clean studio product packshot. If a reference photo contains a hand, finger, arm, or any body part, treat that reference as "product shape only" and DELETE the hand/body in the generated output. Never imitate a hand-held pose. Never invent a hand. Product scale is shown by composition and shadow, not by a hand.',
    '',
    'Composition requirements:',
    '- This is an image-generation/recomposition task, not image selection. Use the uploaded product photos only as references for product identity (shape, color, label), then synthesize a NEW hand-free studio product photo.',
    '- This is the first standalone product image directly below the hero copy. It must focus on the product itself, not on lifestyle mood, props, background scenery, or a banner-like scene.',
    '- Make this image clearly different from the top hero banner: tighter product-only studio packshot, simple background, no large scenic set, no decorative room, no package box as background.',
    '- This is NOT the size-guide image. Create a separate product-focused packshot for the hero body product area.',
    '- SINGLE PHOTO ONLY: output one continuous photorealistic camera shot. No split screen, before/after comparison, collage, side-by-side layout, grid, poster panel, product sheet, or multi-frame composition.',
    '- Use the provided product photos as the exact product reference.',
    studioProductPreservationRules(),
    '- Preserve the product shape, colors, materials, and recognizable details as much as possible.',
    '- Do NOT output an unchanged, cropped, scaled, color-corrected, background-removed, or lightly cleaned version of any uploaded photo.',
    '- INVALID RESULT: if the final image has the same camera angle, same crop, same object positions, same gray/blue/yellow color cast, or same plain background as any uploaded source, regenerate it as a new studio photograph.',
    '- Do NOT place the original photo inside a larger canvas. Rebuild the product arrangement as a fresh camera shot.',
    '- Change the composition from the references: rearrange the visible product units, rebalance spacing, choose a cleaner camera angle, and make it look newly photographed rather than copied.',
    '- Prefer the source photo that shows the clearest real product units, color variants, product labels, or full product shape.',
    '- The final bitmap must fill the entire 4:3 frame edge-to-edge with clean studio background. Do not leave white bands, letterboxing, pasted-photo margins, top/bottom padding, left/right padding, or an inner photo card around the product.',
    '- Treat the background as a seamless studio surface that reaches every edge of the frame, not as a small product photo placed on a larger white canvas.',
    '- Keep the product safely inside the center area because the template fills a tall full-width image slot with object-cover. Crop only expendable background, never important product parts.',
    '- If the product is a set, multi-pack, random color assortment, or the references show multiple product units/real visible variants, do NOT output one giant single unit. Arrange several real units/variants together in one tidy product-only studio group so the viewer understands the assortment at a glance.',
    '- Stage the product group like a commercial catalog packshot: balanced centered composition, neat spacing, one clear foreground hero unit, supporting variants behind or beside it, all important product parts visible and sharp.',
    '- Reposition and recompose the real product units yourself: straighten the group, align bases/lids, balance spacing, and choose a clean product-first angle that makes the items easier to inspect than in the uploaded photos.',
    '- Keep the image product-dominant: the product group should occupy most of the frame with comfortable padding, and the background should stay quiet and secondary.',
    '- If only one product unit is visible across all references, keep one unit but make it a balanced studio product photo with normal ecommerce scale; do not stretch it vertically or make it fill the frame like a size guide.',
    '- Create a fresh clean studio background: neutral white or very light warm surface, aligned horizon, soft three-point lighting, corrected exposure/white balance, and subtle contact shadows.',
    '- Background cleanup is expected by default. If the reference background is not already clean white/studio and crisp, replace it; do not leave bathroom, tabletop, gray, bluish, yellowish, cluttered, or dim backgrounds.',
    '- Re-stage crooked or messy real photos into an organized studio composition, but keep the product objects faithful to the references.',
    '- STRICT NO-HAND RULE: never include hands, fingers, arms, body parts, people, or any human presence. If a reference photo shows a hand holding/squeezing/pouring/using the product, IGNORE that hand and rebuild the product as a hand-free studio object. Product scale is communicated only by clean centered composition and contact shadows — NEVER by a hand or finger.',
    '- Do not use a close-up usage crop OR an in-hand still photo as the hero product image. Convert all hand-held, squeezed, or "person holding product" references into a clean product-first studio arrangement where the product stands or rests on the studio surface by itself.',
    '- VALID hero product packshot: product alone on clean white/light surface, centered, balanced composition, soft shadow, photorealistic ecommerce packshot look.',
    '- INVALID hero product packshot: any image with a visible hand, finger, arm, person, body part, or "human holding/using product" pose — these must be regenerated as a standalone studio shot.',
    '- Make it visually different from a measurement/size guide: use a hero/lifestyle composition, not a technical centered size-chart pose.',
    '- Do not force the product into a perfect front-facing size-guide silhouette.',
    '- Do not use package boxes, retail display boxes, barcode/KC labels, size charts, instruction sheets, rulers, arrows, measurement guides, or captions as the main subject.',
    '- Do not invent new colors, new product shapes, fake package designs, or extra product components that are not visible in the references.',
    '- Do not add Korean text, English text, watermarks, price badges, UI elements, or labels inside the image.',
    `- Keep a bright polished ${style} ecommerce look, clean and product-focused.`,
    '- Keep every important product fully visible and sharp. Avoid awkward cropping.',
    '- Use a clean 4:3 ecommerce product composition for a taller full-width body image area. Keep comfortable padding while making the product group feel large and inspectable.',
    '- Photorealistic commercial product packshot, not a flat illustration.',
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
    '- This is an image-generation/recomposition task, not image selection. Use the uploaded photos as product/color references, then synthesize a NEW clean color lineup image.',
    '- This image will be placed ONLY in the "색상 안내" section of a Korean product detail page.',
    '- SINGLE PHOTO ONLY: output one continuous photorealistic camera shot. No split screen, before/after comparison, collage, side-by-side layout, grid, poster panel, product sheet, or multi-frame composition.',
    '- Use the provided product photos as the exact product reference.',
    studioProductPreservationRules(),
    '- STRICT REARRANGE (overrides reference layout): never paste an uploaded color-lineup photo as-is. Always rebuild the variants as a NEW studio shot.',
    '- All product units MUST stand upright with the SAME orientation (lids/caps facing up, labels facing the camera). Never leave any unit lying on its side, tilted, knocked over, or rotated differently from the others, even if a reference photo shows it that way.',
    '- Arrange the variants in ONE clean straight horizontal row, evenly spaced, all sitting on the same vertical baseline. Reorder them deliberately by color (e.g., warm-to-cool or as listed in Seller options) instead of copying the reference order.',
    '- VALID color guide: all units standing upright in a single straight row, same height baseline, even gaps, clean white background, no overlap, no rotation differences. INVALID: any unit lying down, any unit kept in its original reference position, any unit pasted from the source photo unchanged.',
    '- Reposition and recompose the product variants yourself: align bases/lids, normalize size and perspective, balance spacing, and make the variants easy to compare at a glance.',
    '- HARD BACKGROUND RULE: always restage the products on a clean white (#FFFFFF) or very light warm studio background unless the uploaded image is already perfectly white, sharp, centered, and evenly lit.',
    '- Do not output the raw uploaded photo, a crop of the raw photo, a background-removed raw photo, or a lightly color-corrected raw photo.',
    '- INVALID RESULT: if the final color guide keeps the same camera angle, same crop, same product positions, same gray/blue/yellow cast, or same background as any uploaded source, regenerate it into a newly arranged studio lineup.',
    '- Do not keep the original gray, blue, yellow, dusty, uneven, or shadowy background. Do not keep the original tabletop, wall, room corner, or color cast.',
    '- The variants must look intentionally re-positioned for comparison, not like an uploaded color-row photo pasted into the section.',
    '- Alignment must look deliberate: products upright or naturally laid as a tidy group, same baseline/horizon, balanced spacing, centered within the frame, and no awkward tilt.',
    '- Keep the full product group sharp and easy to compare. Avoid haze, blur, low contrast, translucent overlay effects, vignette, or washed-out color.',
    '- No hands, fingers, arms, people, usage motion, pouring action, props, or lifestyle scene in the color/options guide. Only the product variants should appear.',
    '- If only one product photo is available, create a fresh composition of the same real product using a new angle/background; do not invent unsupported colors.',
    '- If Options/specs explicitly says "색상 구성: 단일 색상", keep it as a single-color guide and do not invent extra variants.',
    '- If Options/specs explicitly says "색상 구성: 여러 색상", include only visible real product variants from the references.',
    '- Do not add color names, callout labels, Korean text, English text, icons, arrows, badges, or captions inside the image. The HTML template will render all text separately.',
    '- Never use a package box, display box, barcode/KC/safety label, size chart, instruction sheet, or unrelated prop as the main subject.',
    '- Preserve real product colors and printed artwork. Do not merge colors or change the product identity.',
    '- Normalize alignment, spacing, exposure, and white balance so all variants look photographed in the same studio session.',
    '- Replace dull gray/blue/yellow backgrounds with a clean white or very light warm studio surface unless the source is already a crisp studio photo.',
    '- Use a clean 4:3 ecommerce section composition with comfortable padding; do not crop off labels, lids, edges, or product bottoms.',
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

export function buildPackageGuidePrompt(input: DetailPageMediaPromptBaseInput): string {
  const audience = describeAudience(input.ageGroup);
  const style = describeAudienceStyle(input.ageGroup);
  return [
    'Create one bright clean studio packshot of the product retail package/display box for the "박스 구성 확인" section of a Korean ecommerce detail page.',
    `Product name: ${input.productName}`,
    `Category: ${input.category}`,
    `Target age/audience: ${audience}`,
    `Product notes: ${input.description}`,
    input.options ? `Options/specs: ${input.options}` : '',
    '',
    'Composition requirements:',
    '- This is an image-generation/recomposition task, not image selection. Use the uploaded package/display-box photo only as a reference for the box shape, printed artwork, and contents, then synthesize a NEW bright studio photo of the same package.',
    '- DEFAULT NO-HAND: never include hands, fingers, arms, people, body parts, or human presence. Show the package on its own.',
    '- SINGLE PHOTO ONLY: output one continuous photorealistic camera shot. No split screen, before/after comparison, collage, side-by-side layout, grid, poster panel, product sheet, or multi-frame composition.',
    '- BRIGHTNESS RULE: dramatically brighten the scene. The reference photo is dim/dark/muddy; the output must look like a fresh well-lit ecommerce packshot with corrected exposure and clean shadows, never a dim or yellow-cast photo.',
    '- BACKGROUND RULE: always restage the package on a clean white (#FFFFFF) or very light warm studio background. Do not keep the original gray, blue, yellow, dusty, shadowy, tabletop, wall, or room background.',
    '- Preserve the exact package shape, header card, display tray, printed characters, label artwork, color print, "12EA" or similar print, and visible product units inside as faithfully as possible. Do not redesign the package, do not invent new characters, do not change the printed artwork.',
    '- Recompose the camera angle slightly so the box looks newly photographed (straight-on or gently angled retail packshot), not a copy of the uploaded photo. Straighten any tilt, center the box, and balance the padding.',
    '- The package must fill most of the 4:3 frame with comfortable padding, and the background should stay quiet and secondary.',
    '- Use soft three-point studio lighting, corrected white balance, subtle contact shadow under the box. Make the box look bright, polished, and crisp.',
    '- Do NOT add Korean text, English text, watermarks, price badges, UI elements, callout labels, captions, or stickers that are not already printed on the package itself.',
    '- Do not output the raw uploaded photo, a crop of the raw photo, a background-removed raw photo, or a lightly color-corrected raw photo. Rebuild it as a new studio photograph.',
    '- INVALID RESULT: if the final image keeps the same camera angle, same crop, same dim lighting, same gray/blue/yellow color cast, or same background as the uploaded source, regenerate it as a new bright studio packshot.',
    `- Keep a bright polished ${style} ecommerce look, clean and package-focused.`,
    '- Photorealistic commercial retail packshot, not a flat illustration.',
  ].filter(Boolean).join('\n');
}

export function buildPackageImagePositionsPrompt(): string {
  return [
    'Classify which candidate images are primarily retail packaging, package boxes, display boxes, outer cartons, or product-in-box composition photos.',
    'Return JSON only: {"packageCandidateIndices":[number, ...]}',
    '',
    'Rules:',
    '- Use the exact candidateIndex numbers shown before each image.',
    '- A package/display-box image must show physical retail packaging as a container: cardboard/paper box, printed display tray, backing header card, outer carton, blister pack, pouch, or product sitting inside/with its package.',
    '- Include images where that physical package/display box is a visible main subject or large supporting subject.',
    '- Include open retail display boxes, boxed sets, outer product boxes, or photos where the product is shown together with its box/tray/header.',
    '- Do NOT include ordinary product-only images, color variant lineups without packaging, size guide images, usage/detail close-ups, safety/KC labels, barcodes, or instruction sheets.',
    '- Product-only color lineups are NOT package images, even when they show many units, lids, stickers, printed product labels, "12EA" text on a product, or products arranged in rows.',
    '- If one image shows products inside a printed retail display box/header/tray and another only shows loose products, choose only the display box/header/tray image.',
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
    '- SINGLE PHOTO ONLY: output one continuous photorealistic camera shot. No split screen, before/after comparison, collage, side-by-side layout, grid, poster panel, product sheet, or multi-frame composition.',
    '- Do not create a "DETAIL FEATURE CALLOUT" design. The template supplies all headings and captions separately.',
    `- ${variantDirection}`,
    '- Use the provided product photos as the exact product reference.',
    studioProductPreservationRules(),
    '- Never design a new product, new shape, new character, or new package. Only restage the same product from the references.',
    '- If source images are too few, create a new camera composition/background from the same product instead of repeating the same crop.',
    '- Vary the composition from previous sections: use a different crop, zoom level, camera angle, or product placement while keeping the product recognizable.',
    '- Prefer enlarged product composition shots that make the product easier to inspect, not another full duplicate of the uploaded photo.',
    '- Preserve product shape, proportions, colors, printed artwork, materials, and important physical details.',
    '- HARD BACKGROUND RULE: perform a studio cleanup by default. Straighten, center, correct color cast, and replace the original background with clean white (#FFFFFF) or very light warm studio surface while preserving the unchanged product.',
    '- Do not output the raw uploaded photo with its original gray, blue, yellow, dusty, uneven, or shadowy background. Do not keep the original tabletop, wall, room corner, or color cast.',
    '- Alignment must look deliberate: product centered, level horizon, comfortable padding, no awkward tilt, and no accidental off-center crop.',
    '- Use at most ONE visible hand if a hand interaction is required. Never show two hands, both hands, two wrists, or two separate arms in a DETAIL generated image.',
    '- Prefer product-only detail shots when the action can be understood without a hand.',
    '- Keep the product sharp and inspectable. Avoid haze, blur, low contrast, translucent overlay effects, vignette, or washed-out color.',
    '- Do not render the product name inside this image.',
    '- No Korean text, English text, numbers, fake KC marks, barcodes, certifications, brand logos, prices, watermarks, or long text.',
    '- Do not use package boxes, display boxes, outer boxes, or retail packaging as the subject for DETAIL generated images. Package/box images are handled separately by the template using original source photos.',
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
    '- SINGLE PHOTO ONLY: output one continuous photorealistic camera shot. No split screen, before/after comparison, collage, side-by-side layout, grid, poster panel, product sheet, or multi-frame composition.',
    '- Do not render "사용법 안내", step numbers, Korean text, English text, icons, arrows, captions, badges, or labels inside the image.',
    '- Use the provided product photos as the exact product reference.',
    studioProductPreservationRules(),
    '- Preserve product shape, proportions, colors, printed artwork, and materials.',
    '- HARD BACKGROUND RULE: if a real action photo is crooked, dim, yellow, gray, blue, dusty, or visually messy, restage it into a realistic clean studio use photo with the same product/action and corrected color balance.',
    '- Replace non-white or unclear backgrounds by default with clean white (#FFFFFF) or very light warm studio surface; keep the product/action, not the original room, table, wall, or color cast.',
    '- Alignment must look deliberate: product centered, level horizon, comfortable padding, no awkward tilt, and no accidental off-center crop.',
    '- Show a realistic hand interaction only if it helps explain the step; use natural short nails, no manicure, no nail polish.',
    '- Use at most ONE visible hand. Never show two hands, both hands, two wrists, or two separate arms in a usage generated image.',
    '- If the action can be understood product-only, remove hands entirely and show the product/action cleanly.',
    '- Keep the product sharp and inspectable. Avoid haze, blur, low contrast, translucent overlay effects, vignette, or washed-out color.',
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
    '- SINGLE CUTOUT ONLY: no split screen, before/after comparison, collage, side-by-side layout, grid, poster panel, product sheet, or multi-frame composition.',
    '- Gemini must choose/isolate one product unit from the references and create a new centered size-guide image. Do not simply reuse an uploaded crop.',
    '- If the references show multiple color variants, choose the clearest front-facing single unit, preferably the center/default variant, and remove every other unit.',
    '- If there is no single-unit source photo, isolate one representative unit from a group photo and reconstruct it as a clean single-product cutout.',
    '- Never output a group photo, multi-color lineup, package box, display box, hand, or lifestyle scene.',
    '- Remove all duplicate units, packaging boxes, hands, props, lifestyle backgrounds, text overlays, logos added by AI, badges, and measurement labels.',
    '- Exactly one product unit means no partial package, display tray, backing card, cardboard edge, printed retail text, sticker scrap, barcode/KC label, or box fragment under/behind the product.',
    '- If the best source has package material touching the product, remove the package completely and reconstruct the missing product bottom cleanly instead of leaving a package scrap.',
    '- Do not use a retail display/box image as the source subject for the size guide. Isolate only the product body/cap/label unit.',
    studioProductPreservationRules(),
    '- Preserve the real product shape, colors, printed illustrations, materials, and proportions as much as possible.',
    '- The product must be fully visible, exactly centered, and large enough to read size clearly.',
    '- Center the isolated product itself on the final transparent cutout canvas. Measurement labels and guide lines are added later by the template; do not leave the object visually shifted to one side.',
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

function studioProductPreservationRules(): string {
  return [
    '- PRODUCT-LOCKED STUDIO CLEANUP: keep the real product units from the reference as the subject; improve only background, alignment, crop, exposure, white balance, and studio lighting.',
    '- Do not redraw, redesign, recolor, simplify, or replace the product body, cap, label sticker, printed character, packaging artwork, texture, material, or proportions.',
    '- When a calling prompt asks for a hand-free or product-only studio shot, remove hands/body parts while preserving the same product shape and visible details; do not keep the original hand-held pose.',
    '- Never warp, bend, liquify, stretch, compress, mirror, or perspective-distort the product. If the source product is tilted, rotate/reframe the camera composition instead of deforming the product.',
    '- If the source background is yellowish, gray, bluish, dusty, vignetted, uneven, off-white, cluttered, dim, or simply not crisp, replace only the background with a clean neutral white or very light warm studio surface.',
    '- Straighten the horizon, center the product group, remove awkward tilt, align spacing between units, keep comfortable padding, and make the composition look intentionally photographed in a clean studio.',
    '- Keep original visible color variants and set quantity exactly as provided. Do not invent extra colors, duplicate products, remove real units, or add props that are not necessary.',
    '- Preserve realistic shadows and contact shadows under the same product; do not create a floating cutout unless a transparent cutout is explicitly requested.',
    '- DEFAULT NO-HAND: if hands, fingers, arms, or any body part appear in the reference photos, remove them by default and rebuild the product as a hand-free studio object. Only keep a single natural hand if the calling prompt EXPLICITLY requires a hand interaction (e.g., usage-guide step). Hero packshots, color guides, size guides, and isolated product shots must always be hand-free.',
    '- Never use KC/safety labels, barcode labels, instruction labels, or legal text images as a generated product scene; those must remain original safety images outside generated sections.',
  ].join('\n');
}

function describePeopleRule(ageGroup?: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') {
    return [
      '- AGE 14+ HARD RULE: do not show a child face, child head, cheek, young child body, elementary-looking model, preschool child, toddler, baby, or child lifestyle scene.',
      '- For 14+ products, prefer product-only images. If a hand is necessary, use only one cropped teen/adult-looking hand and avoid faces/full bodies.',
      '- If any lifestyle use scene appears, it must read as 14+ teen/student or adult, never a young child.',
      '- Do NOT use childish nursery/playroom cues, preschool props, toddler proportions, elementary-school models, or childlike styling.',
    ].join('\n');
  }
  return [
    '- For 8+ products, product-only images are preferred when possible.',
    '- If a person, hands, or lifestyle use scene appears, keep them elementary-school age or older; do not depict toddlers or babies.',
    '- Avoid unnecessary faces/full bodies; a clean product scene or one cropped hand is usually better for ecommerce detail images.',
  ].join('\n');
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
