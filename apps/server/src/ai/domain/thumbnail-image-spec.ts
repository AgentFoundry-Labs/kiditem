import type { ImageSpec, ImageSpecIssue } from '@kiditem/shared/ai';
// NOTE: tsconfig.module='commonjs' + esModuleInterop 미설정 환경에서 sharp 는
// callable 인 module.exports 자체. `import sharp from 'sharp'` 로 default 를
// 받으면 sharp_1.default = undefined → 런타임 TypeError.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

export interface ImageBytes {
  data: string;
  mimeType: string;
}

export interface PixelBackgroundVerdict {
  verdict: 'white' | 'not-white' | 'inconclusive';
  maskCoverage: number;
  meanRgb: [number, number, number];
  maxChannelDiff: number;
  stdBrightness: number;
  reason?: string;
}

/**
 * Flood-fill from the image border, build a "background candidate" mask, and
 * decide whether that mask is pure white (#FFFFFF-adjacent) or some other
 * color/gradient. If the mask covers under 5% of the frame the verdict is
 * `inconclusive` so the caller can fall back to an LLM judgment instead of
 * misclassifying a product-filled frame.
 */
export async function analyzeWhiteBackgroundByPixels(
  imageData: ImageBytes,
): Promise<PixelBackgroundVerdict> {
  const buf = Buffer.from(imageData.data, 'base64');
  const { data, info } = await sharp(buf)
    .removeAlpha()
    .resize({ width: 512, height: 512, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const N = W * H;

  const isBgCandidate = (pixelOffset: number): boolean => {
    const r = data[pixelOffset];
    const g = data[pixelOffset + 1];
    const b = data[pixelOffset + 2];
    const minc = r < g ? (r < b ? r : b) : g < b ? g : b;
    const maxc = r > g ? (r > b ? r : b) : g > b ? g : b;
    return minc >= 230 && maxc - minc < 12;
  };

  const mask = new Uint8Array(N);
  const queue: number[] = [];
  for (let x = 0; x < W; x++) {
    queue.push(x);
    queue.push((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    queue.push(y * W);
    queue.push(y * W + W - 1);
  }

  let head = 0;
  while (head < queue.length) {
    const p = queue[head++];
    if (mask[p]) continue;
    if (!isBgCandidate(p * C)) continue;
    mask[p] = 1;
    const x = p % W;
    const y = (p / W) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < W - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - W);
    if (y < H - 1) queue.push(p + W);
  }

  let cnt = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let sumBri = 0;
  let sumBri2 = 0;
  for (let p = 0; p < N; p++) {
    if (!mask[p]) continue;
    const i = p * C;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    cnt++;
    sumR += r;
    sumG += g;
    sumB += b;
    if (r < minR) minR = r;
    if (g < minG) minG = g;
    if (b < minB) minB = b;
    const bri = (r + g + b) / 3;
    sumBri += bri;
    sumBri2 += bri * bri;
  }

  const coverage = cnt / N;
  if (coverage < 0.05) {
    return {
      verdict: 'inconclusive',
      maskCoverage: coverage,
      meanRgb: [0, 0, 0],
      maxChannelDiff: 0,
      stdBrightness: 0,
      reason: `배경 마스크 면적 ${(coverage * 100).toFixed(1)}% — 상품이 프레임 대부분 차지, LLM fallback`,
    };
  }

  const meanR = sumR / cnt;
  const meanG = sumG / cnt;
  const meanB = sumB / cnt;
  const meanBri = sumBri / cnt;
  const varBri = sumBri2 / cnt - meanBri * meanBri;
  const stdBri = Math.sqrt(Math.max(0, varBri));
  const maxChannelDiff = Math.max(
    Math.abs(meanR - meanG),
    Math.abs(meanG - meanB),
    Math.abs(meanR - meanB),
  );
  const minChannelMean = Math.min(meanR, meanG, meanB);
  const lowestPixelMin = Math.min(minR, minG, minB);

  const isWhite =
    minChannelMean >= 248 && maxChannelDiff < 3 && stdBri < 4 && lowestPixelMin >= 220;

  const reasonParts: string[] = [];
  if (minChannelMean < 248) {
    reasonParts.push(
      `배경 평균 RGB(${meanR.toFixed(0)},${meanG.toFixed(0)},${meanB.toFixed(0)}) 순백 미달`,
    );
  }
  if (maxChannelDiff >= 3) {
    reasonParts.push(`채널 편차 ${maxChannelDiff.toFixed(1)} — 유채색 틴트`);
  }
  if (stdBri >= 4) {
    reasonParts.push(`밝기 std ${stdBri.toFixed(1)} — 그라데이션/명암차`);
  }
  if (lowestPixelMin < 220) {
    reasonParts.push(`배경에 어두운 픽셀 존재 (min 채널 ${lowestPixelMin})`);
  }

  return {
    verdict: isWhite ? 'white' : 'not-white',
    maskCoverage: coverage,
    meanRgb: [meanR, meanG, meanB],
    maxChannelDiff,
    stdBrightness: stdBri,
    reason: isWhite ? undefined : reasonParts.join('; '),
  };
}

export async function parseImageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(buffer).metadata();
    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * Convert raw measurement values into a Coupang representative-image policy
 * `ImageSpec`. Resolution thresholds, aspect-ratio tolerance, and 10MB cap
 * match the original `ThumbnailVisionAiService.checkImageSpec` semantics.
 */
export function deriveImageSpec(input: {
  width: number;
  height: number;
  byteLength: number;
  mimeType: string;
}): ImageSpec {
  const { width, height, byteLength, mimeType } = input;
  const issues: ImageSpecIssue[] = [];
  if (width < 1000 || height < 1000) {
    issues.push({
      type: 'low_resolution',
      severity: 'fail',
      message: `최소 해상도 미달 (${width}x${height}, 최소 1000x1000)`,
    });
  } else if (width < 2000 || height < 2000) {
    issues.push({
      type: 'low_resolution',
      severity: 'warn',
      message: `권장 해상도 미달 (${width}x${height}, 권장 2000x2000)`,
    });
  }
  if (width > 0 && height > 0 && Math.abs(width / height - 1) > 0.01) {
    issues.push({
      type: 'aspect_ratio',
      severity: 'fail',
      message: `1:1 비율 아님 (${width}x${height})`,
    });
  }
  if (byteLength > 10 * 1024 * 1024) {
    issues.push({
      type: 'file_too_large',
      severity: 'fail',
      message: `파일 크기 초과 (${Math.round(byteLength / 1024 / 1024)}MB, 최대 10MB)`,
    });
  }
  return {
    width,
    height,
    aspectRatio: height > 0 ? Math.round((width / height) * 100) / 100 : 0,
    fileSizeKB: Math.round(byteLength / 1024),
    format: mimeType,
    issues,
  };
}
