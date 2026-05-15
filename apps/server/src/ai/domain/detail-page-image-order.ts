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

export async function trimSafetyLabelWhitespace(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;
  if (originalWidth <= 0 || originalHeight <= 0) return buffer;

  const { data, info } = await image
    .clone()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = findNonWhiteBounds(data, info.width, info.height, info.channels);
  if (!bounds) return buffer;

  const scanPadding = Math.max(3, Math.round(Math.min(info.width, info.height) * 0.01));
  const left = Math.max(0, bounds.left - scanPadding);
  const top = Math.max(0, bounds.top - scanPadding);
  const right = Math.min(info.width - 1, bounds.right + scanPadding);
  const bottom = Math.min(info.height - 1, bounds.bottom + scanPadding);

  const scaleX = originalWidth / info.width;
  const scaleY = originalHeight / info.height;
  const cropLeft = Math.max(0, Math.floor(left * scaleX));
  const cropTop = Math.max(0, Math.floor(top * scaleY));
  const cropRight = Math.min(originalWidth, Math.ceil((right + 1) * scaleX));
  const cropBottom = Math.min(originalHeight, Math.ceil((bottom + 1) * scaleY));
  const cropWidth = cropRight - cropLeft;
  const cropHeight = cropBottom - cropTop;

  if (cropWidth <= 0 || cropHeight <= 0) return buffer;
  if (cropWidth / originalWidth > 0.985 && cropHeight / originalHeight > 0.985) return buffer;

  return image
    .clone()
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .toBuffer();
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

function findNonWhiteBounds(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { left: number; top: number; right: number; bottom: number } | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      if (isWhiteBackgroundPixel(data[offset], data[offset + 1], data[offset + 2])) continue;

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  return right >= left && bottom >= top ? { left, top, right, bottom } : null;
}

function isWhiteBackgroundPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= 248 && max - min <= 18;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
