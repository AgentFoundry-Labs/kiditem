const SAFETY_LABEL_MARKERS = [
  'safety-label',
  'compliance-label',
  'quality-label',
  'kc-label',
  'kc-cert',
  'certification-label',
  'warning-label',
  '품질표시',
  '안전특별법',
  '사용시주의사항',
  '안전확인',
];

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
  return SAFETY_LABEL_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
