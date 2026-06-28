export const ORDER_COLLECTION_MALL_LABELS: Record<string, string> = {
  'one-polaris': '원폴라리스',
  'icecream-mall': '아이스크림몰',
  kidkids: '키드키즈',
  kidsnote: '키즈노트',
  'haebub-mall': '해법몰',
  onch: '온채널',
  kkomangse: '꼬망세',
  art09: '아트공구',
  'tekville-edu': '테크빌교육',
  'benepia-mul': '베네피아물',
};

interface OrderCollectionMallSource {
  mallKey?: string | null;
  mallName?: string | null;
  sourceName: string;
  fileName: string;
}

const ORDER_COLLECTION_MALL_MATCHERS = Object.entries(ORDER_COLLECTION_MALL_LABELS).map(
  ([key, label]) => ({
    key,
    tokens: [key.toLowerCase(), label.toLowerCase()],
  }),
);

export function resolveOrderCollectionMallKey(item: OrderCollectionMallSource): string | null {
  if (item.mallKey) return item.mallKey;

  const searchable = `${item.mallName ?? ''} ${item.sourceName} ${item.fileName}`.toLowerCase();
  for (const matcher of ORDER_COLLECTION_MALL_MATCHERS) {
    if (matcher.tokens.some((token) => searchable.includes(token))) {
      return matcher.key;
    }
  }

  return null;
}

export function resolveOrderCollectionMallName(
  item: Pick<OrderCollectionMallSource, 'mallKey' | 'mallName'>,
): string | null {
  return item.mallName ?? (item.mallKey ? ORDER_COLLECTION_MALL_LABELS[item.mallKey] : null) ?? null;
}
