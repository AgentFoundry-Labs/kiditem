/**
 * 키 순서와 무관한 JSON 직렬화. 같은 상세인지 비교할 때 쓴다(`channel-listing-raw-sections`). 옛 카탈로그 attempt의
 * 청크·스냅샷 해시는 실행 계약(KID-354)으로 옮기며 사라졌다 — 청크 checksum은 실행 계약이 본다.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`;
}
