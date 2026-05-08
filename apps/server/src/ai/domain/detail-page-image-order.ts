// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

const SAFETY_LABEL_URL_MARKERS = [
  'safety-label',
  'compliance-label',
  'quality-label',
  'kc-label',
  'kc-cert',
  'certification-label',
  'warning-label',
  'barcode',
  'bar-code',
  '바코드',
  '품질표시',
  '품질경영',
  '안전특별법',
  '사용시주의사항',
  '안전확인',
  '어린이제품',
  '표시사항',
  'KC',
];

interface LabelPixelStats {
  aspectRatio: number;
  whiteRatio: number;
  inkRatio: number;
  redRatio: number;
  activeRows: number;
  rowGroups: number;
  barcodeStripeColumns: number;
  barcodeTransitions: number;
}

export function moveSafetyLabelImagesToEnd(urls: string[]): string[] {
  const productImages: string[] = [];
  const safetyLabelImages: string[] = [];
  for (const url of urls) {
    if (isSafetyLabelImageUrl(url)) {
      safetyLabelImages.push(url);
    } else {
      productImages.push(url);
    }
  }
  return [...productImages, ...safetyLabelImages];
}

export function isSafetyLabelImageUrl(url: string): boolean {
  const normalized = safeDecode(url).toLowerCase();
  return SAFETY_LABEL_URL_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

export async function looksLikeSafetyLabelImage(buffer: Buffer): Promise<boolean> {
  const stats = await getLabelPixelStats(buffer);
  let score = 0;

  if (stats.aspectRatio >= 1.35) score += 1;
  if (stats.whiteRatio >= 0.48) score += 1;
  if (stats.inkRatio >= 0.035 && stats.inkRatio <= 0.36) score += 1;
  if (stats.redRatio >= 0.0015) score += 1;
  if (stats.activeRows >= 30 && stats.rowGroups >= 3) score += 1;
  if (stats.barcodeStripeColumns >= 20 && stats.barcodeTransitions >= 18) score += 2;

  return score >= 5 || (
    stats.whiteRatio >= 0.5 &&
    stats.inkRatio >= 0.045 &&
    stats.barcodeStripeColumns >= 28 &&
    stats.barcodeTransitions >= 24
  );
}

async function getLabelPixelStats(buffer: Buffer): Promise<LabelPixelStats> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .resize({ width: 512, height: 512, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  const pixelCount = Math.max(1, width * height);
  const rowInkCounts = new Uint16Array(height);
  const lowerHalfColumnInkCounts = new Uint16Array(width);

  let whitePixels = 0;
  let inkPixels = 0;
  let redPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      const isWhite = min >= 232 && max - min <= 38;
      const isDarkInk = brightness <= 92 && max - min <= 90;
      const isRedInk = r >= 150 && g <= 105 && b <= 105 && r - Math.max(g, b) >= 45;

      if (isWhite) whitePixels++;
      if (isDarkInk || isRedInk) {
        inkPixels++;
        rowInkCounts[y]++;
        if (y >= height * 0.45) lowerHalfColumnInkCounts[x]++;
      }
      if (isRedInk) redPixels++;
    }
  }

  let activeRows = 0;
  let rowGroups = 0;
  let inGroup = false;
  for (const count of rowInkCounts) {
    const ratio = count / width;
    const isActive = ratio >= 0.025 && ratio <= 0.72;
    if (isActive) {
      activeRows++;
      if (!inGroup) rowGroups++;
      inGroup = true;
    } else {
      inGroup = false;
    }
  }

  let barcodeStripeColumns = 0;
  let barcodeTransitions = 0;
  let previousStripe = false;
  const lowerHalfHeight = Math.max(1, height - Math.floor(height * 0.45));
  for (const count of lowerHalfColumnInkCounts) {
    const isStripe = count / lowerHalfHeight >= 0.16;
    if (isStripe) barcodeStripeColumns++;
    if (isStripe !== previousStripe) barcodeTransitions++;
    previousStripe = isStripe;
  }

  return {
    aspectRatio: height > 0 ? width / height : 1,
    whiteRatio: whitePixels / pixelCount,
    inkRatio: inkPixels / pixelCount,
    redRatio: redPixels / pixelCount,
    activeRows,
    rowGroups,
    barcodeStripeColumns,
    barcodeTransitions,
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
