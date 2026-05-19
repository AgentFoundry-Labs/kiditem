import type { KidsPlayfulGenerationItem } from '../../detail-template-generation/hooks/useKidsPlayfulGenerate';

const KC_KEY_PATTERN = /^\s*kc\s*인증\s*(번호)?\s*$/i;
const PLACEHOLDER_VALUES = new Set(['있음', '없음', '미입력', '확인 필요', '-', '?']);

interface ProductInfoItem {
  key?: unknown;
  value?: unknown;
}

export function extractKcCertificationNumber(
  entries: ReadonlyArray<KidsPlayfulGenerationItem>,
): string | null {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const entry of sorted) {
    if (entry.imageProcessingStatus !== 'completed') continue;
    const result = entry.result as { productInfo?: ProductInfoItem[] } | null;
    const items = Array.isArray(result?.productInfo) ? result.productInfo : [];
    for (const item of items) {
      const key = typeof item.key === 'string' ? item.key.trim() : '';
      const value = typeof item.value === 'string' ? item.value.trim() : '';
      if (!value) continue;
      if (!KC_KEY_PATTERN.test(key)) continue;
      if (PLACEHOLDER_VALUES.has(value)) continue;
      return value;
    }
  }
  return null;
}
