const PRODUCT_PRESERVATION_RULES = (
  'This is product-preservation editing, not product generation. ' +
  'Preserve the exact product identity, silhouette, shape, proportions, material, color, ' +
  'texture, surface pattern, printed artwork, seams, holes, caps, buttons, and all visible ' +
  'details from the input image. Do not synthesize, redesign, reinterpret, beautify, simplify, ' +
  'repair, complete, or replace the product. If the request requires a new commercial mood, ' +
  'change only the surrounding background, lighting, crop, or staging context while keeping ' +
  'the product unchanged. Do not add text, captions, price badges, logos, or watermarks unless ' +
  'the user explicitly asks for text.'
);

const PRESET_PROMPTS: Record<string, string> = {
  remove_background:
    'Remove the entire photo/background around the visible main product, then place the product on a clean pure white (#FFFFFF) background. ' +
    'Do not output transparency, alpha channel, checkerboard, checkered grid, gray grid, or any transparency-preview pattern. ' +
    'Keep only the visible main subject, preserve the original product shape and edges, do not redraw the product, and do not add text.',
  remove_text:
    'Remove all overlay text and watermarks from the image and inpaint those areas cleanly. ' +
    'Do not remove text, logos, graphics, or labels that are physically printed on the product or packaging.',
  replace_background: '',
  enhance:
    'Enhance image quality, improve clarity and sharpness while preserving the original product exactly.',
  full_regenerate:
    'Create a more commercial product photo from this image while preserving the product exactly. ' +
    'Do not create a different product.',
  custom: '',
};

export function buildImageEditPrompt(input: {
  preset: string;
  userPrompt?: string;
}): string {
  const preset = input.preset || 'custom';
  const userPrompt = input.userPrompt?.trim() ?? '';
  const presetPrompt = PRESET_PROMPTS[preset] ?? '';
  let editRequest: string;

  if (preset === 'replace_background' || preset === 'custom') {
    editRequest = userPrompt || 'Edit this image';
  } else if (presetPrompt && userPrompt) {
    editRequest = `${presetPrompt}. Additional: ${userPrompt}`;
  } else if (presetPrompt) {
    editRequest = presetPrompt;
  } else {
    editRequest = userPrompt || 'Edit this image';
  }

  return `${PRODUCT_PRESERVATION_RULES}\n\nUser edit request:\n${editRequest}`;
}

export function buildColorGuideImageEditPrompt(): string {
  return [
    'Arrange these product photos side by side on a clean white background.',
    'Keep each product exactly as-is, no modifications to shape, color, or details.',
    'Equal spacing between items. Professional product catalog layout.',
    'Do NOT add any text, labels, or decorations.',
  ].join(' ');
}
