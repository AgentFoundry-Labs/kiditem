import { z } from 'zod';

/**
 * `channel_listing_options.attributes_json`의 저장 모양 (KID-349).
 *
 * 구매속성(purchase)은 Wing 상세와 엑셀 구매옵션 헤더가, 검색옵션(search)은 엑셀 검색옵션
 * 칸이 준다. 두 경로가 한 칸을 번갈아 덮지 않도록 kind별로 합친다: 한 경로는 자기 kind의
 * 항목만 통째로 바꾸고 다른 kind는 그대로 둔다.
 *
 * 구역 이전 행의 `{type, value}`와 다른 owner가 쓴 `{}`는 읽을 때 이 모양으로 맞춘다.
 */
export const LISTING_ATTRIBUTE_KINDS = ['purchase', 'search'] as const;
export type ListingAttributeKind = (typeof LISTING_ATTRIBUTE_KINDS)[number];

export const StoredListingAttributeSchema = z.object({
  kind: z.enum(LISTING_ATTRIBUTE_KINDS),
  /** Wing attributeTypeId. 엑셀 검색옵션과 옛 행은 모른다(`null`). */
  attributeTypeId: z.string().min(1).nullable(),
  name: z.string().min(1),
  value: z.string(),
  /** 노출 여부. 원천이 말하지 않으면 `null`. */
  exposed: z.boolean().nullable(),
}).strict();
export type StoredListingAttribute = z.infer<typeof StoredListingAttributeSchema>;
export const StoredListingAttributesSchema = z.array(StoredListingAttributeSchema);

/** 확장·엑셀 파서가 넘기는 한 속성. `kind`가 없으면 호출부가 경로로 정한다. */
export type WireListingAttribute = {
  type: string;
  value: string;
  kind?: ListingAttributeKind;
  attributeTypeId?: string | null;
  exposed?: boolean | null;
};

export function attributesFromWire(
  items: readonly WireListingAttribute[],
  defaultKind: ListingAttributeKind,
): StoredListingAttribute[] {
  return items.map((item) => StoredListingAttributeSchema.parse({
    kind: item.kind ?? defaultKind,
    attributeTypeId: item.attributeTypeId ?? null,
    name: item.type,
    value: item.value,
    exposed: item.exposed ?? null,
  }));
}

/** 저장된 값을 현재 모양으로. 옛 `{type, value}`는 구매속성으로, 배열이 아니면 빈 목록으로. */
export function normalizeStoredAttributes(value: unknown): StoredListingAttribute[] {
  if (!Array.isArray(value)) return [];
  const normalized: StoredListingAttribute[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const current = StoredListingAttributeSchema.safeParse(candidate);
    if (current.success) {
      normalized.push(current.data);
      continue;
    }
    if (typeof candidate.type === 'string' && candidate.type && typeof candidate.value === 'string') {
      normalized.push({ kind: 'purchase', attributeTypeId: null, name: candidate.type, value: candidate.value, exposed: null });
    }
  }
  return normalized;
}

/**
 * `kinds`에 든 kind는 `incoming`으로 통째로 바꾸고 나머지 kind는 저장값을 지킨다. 저장값이
 * 먼저, 새 값이 뒤에 온다. 같은 (kind, id 또는 이름, 값)은 한 번만 남는다.
 */
export function mergeAttributesByKind(
  existing: unknown,
  incoming: readonly StoredListingAttribute[],
  kinds: readonly ListingAttributeKind[],
): StoredListingAttribute[] {
  const replaced = new Set(kinds);
  const kept = normalizeStoredAttributes(existing).filter((attribute) => !replaced.has(attribute.kind));
  const added = incoming.filter((attribute) => replaced.has(attribute.kind));
  const seen = new Set<string>();
  return [...kept, ...added].filter((attribute) => {
    const key = `${attribute.kind}\u0000${attribute.attributeTypeId ?? attribute.name}\u0000${attribute.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
