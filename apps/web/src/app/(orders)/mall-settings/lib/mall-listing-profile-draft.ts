import {
  MALL_LISTING_PROFILE_FIELDS,
  type MallListingProfile,
  type MallListingProfileFieldDefinition,
  type UpdateMallListingProfile,
} from '@kiditem/shared/channel-account';

export type ListingProfileKey = MallListingProfileFieldDefinition['key'];

/** 칸 하나의 저장된 값 — 한 줄 글, 또는 `summary` 없이 저장돼 화면이 읽기만 하는 기록(JSON 요약). */
export type StoredListingProfileValue =
  | { readonly editable: true; readonly text: string }
  | { readonly editable: false; readonly json: string };

/**
 * 저장된 문서 → 칸마다 보일 값. 기록 항목은 화면이 `summary` 한 칸으로 적는다; `summary` 가 없는 객체는
 * 다른 경로가 넣은 풍부한 값이라 고쳐 쓰지 않고 JSON 으로만 보인다(덮어쓰기는 따로 연다).
 */
export function storedListingProfileValues(
  profile: MallListingProfile | null | undefined,
): Record<ListingProfileKey, StoredListingProfileValue> {
  return Object.fromEntries(MALL_LISTING_PROFILE_FIELDS.map((field) => {
    const value = profile?.[field.key] ?? null;
    if (field.kind === 'text' || value === null) {
      return [field.key, { editable: true, text: typeof value === 'string' ? value : '' }];
    }
    const summary = (value as Record<string, unknown>).summary;
    return [field.key, typeof summary === 'string'
      ? { editable: true, text: summary }
      : { editable: false, json: JSON.stringify(value) }];
  })) as Record<ListingProfileKey, StoredListingProfileValue>;
}

/**
 * 고친 칸만 요청에 싣는다 — 서버가 보낸 키만 바꾸고 나머지를 보존하므로, 건드리지 않은 칸을 보내 덮지 않는다.
 * 빈 칸은 비움(`null`), 기록 항목은 `{ summary }` 다.
 */
export function listingProfileUpdateFromEdits(
  stored: Record<ListingProfileKey, StoredListingProfileValue>,
  edits: Partial<Record<ListingProfileKey, string>>,
): UpdateMallListingProfile {
  const update: Record<string, unknown> = {};
  for (const field of MALL_LISTING_PROFILE_FIELDS) {
    const edit = edits[field.key];
    if (edit === undefined) continue;
    const text = edit.trim();
    const before = stored[field.key];
    if (before.editable && before.text.trim() === text) continue;
    update[field.key] = text === '' ? null : field.kind === 'record' ? { summary: text } : text;
  }
  return update as UpdateMallListingProfile;
}
