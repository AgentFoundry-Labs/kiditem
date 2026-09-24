export type ChannelRecipeNameOption = {
  listingName: string | null;
  itemName: string | null;
};

export type ChannelRecipeNameSku = {
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number | null;
};

export type ChannelRecipeNameEvidence = {
  kind: 'normalized_name' | 'contained_name' | 'fuzzy_name';
  channelValue: string;
  normalizedValue: string;
  score: number;
  sku: ChannelRecipeNameSku;
};

type PreparedName = {
  value: string;
  pairCounts: Map<string, number>;
  pairCount: number;
};

type PreparedChannelName = PreparedName & {
  channelValue: string;
  source: 'listing' | 'item' | 'combined';
};

type PreparedSkuName = PreparedName & {
  productValue: string;
  optionValue: string;
  sku: ChannelRecipeNameSku;
};

export type ChannelRecipeNameIndex = {
  entries: PreparedSkuName[];
};

const SALES_UNIT_TOKEN = /(?:\d+\s*(?:개입|개|입|팩|pcs?|p|ea|세트|묶음|권|매|장|봉)(?![\p{L}\p{N}])|\bx\s*\d+\b)/giu;
/**
 * 셀피아가 상품 이름 앞에 붙여 두는 값(`2000늘어나는파스텔슬라임`). 몰 이름에는 없을 때가
 * 많아 양쪽에서 똑같이 걷어낸다.
 *
 * 숫자 앞에 글자가 아닌 것이 남아 있어도 걷어낸다 — 브랜드 표기를 뺀 자리에 괄호가 남아
 * (`[키드아이템] 2000…` → `[] 2000…`) 값이 붙은 채로 살아남았고, 그래서 같은 상품이
 * 이름은 비슷한데 정확히 같지는 않은 것으로 읽혀 자동으로 잇지 못했다(라이브 2026-09-17).
 */
const LEADING_PRICE = /^[^\p{L}\p{N}]*\d{3,6}(?=[^\d]|$)/u;
const SINGLE_UNIT_LABEL = /(?:단품|단일상품|낱개)\s*$/giu;

/**
 * 우리 브랜드 표기. 몰마다 철자가 달라 상품명 앞에 붙은 채로 남으면 같은 상품을 다른
 * 이름으로 읽는다 — 아이스크림몰 고시 품명이 `[kiditem] 해피글로우야광꽈배기프로펠라`
 * 인데 셀피아는 `해피글로우야광꽈배기프로펠라` 라서 안 맞았다(라이브 2026-09-17, 48건).
 */
const BRAND_TOKEN = /(?:ky\s*i\s*&\s*d|kiditem|키드아이템)/giu;

export function normalizeChannelRecipeName(value: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(BRAND_TOKEN, '')
    .replace(LEADING_PRICE, '')
    .replace(/\b(?:pack|box)\b/giu, '')
    .replace(SALES_UNIT_TOKEN, '')
    .replace(SINGLE_UNIT_LABEL, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * 몰 제목 안에 셀피아 상품 이름이 그대로 들어 있는가. 몰 제목은 셀피아 이름에 설명을 덧붙인 것이 많아(`톡톡 팝콘 플레이
 * 장난감 어린이 완구 …` ⇢ `3000톡톡팝콘플레이`) 이름 점수는 낮아도 같은 상품이다(라이브 2026-09-19: 셀피아 코드가 맞는
 * 판매중 옵션 556개 중 137개). 값 · 묶음 표기를 뗀 셀피아 이름이 세 글자 이상일 때만 본다.
 */
export function channelTitleContainsSkuName(
  options: readonly ChannelRecipeNameOption[],
  skuName: string | null,
): boolean {
  const name = normalizeChannelRecipeName(skuName);
  if (name.length < 3) return false;
  return options.some((option) => [option.listingName, option.itemName]
    .some((value) => normalizeChannelRecipeName(value).includes(name)));
}

export function scoreChannelRecipeNameCandidate(
  options: ChannelRecipeNameOption[],
  sku: ChannelRecipeNameSku,
): ChannelRecipeNameEvidence {
  const preparedSku = prepareSku(sku);
  const scored = [
    ...prepareOptions(options).map((option) =>
      scorePreparedCandidate(option, preparedSku)),
    scoreStructuredCandidate(options, preparedSku),
  ].filter((item): item is ChannelRecipeNameEvidence => item !== null);
  return scored.sort(compareEvidence)[0] ?? {
    kind: 'fuzzy_name',
    channelValue: '',
    normalizedValue: '',
    score: 0,
    sku,
  };
}

/**
 * Score barcode/name evidence only when both sides provide a comparable name.
 * A missing name is unknown evidence, not a measured mismatch.
 */
export function scoreChannelRecipeNameCandidateIfComparable(
  options: readonly ChannelRecipeNameOption[],
  sku: ChannelRecipeNameSku,
): number | null {
  if (!sku.name?.trim() || !options.some((option) =>
    Boolean(option.listingName?.trim() || option.itemName?.trim()))) {
    return null;
  }
  return scoreChannelRecipeNameCandidate([...options], sku).score;
}

export function createChannelRecipeNameIndex(
  skus: ChannelRecipeNameSku[],
): ChannelRecipeNameIndex {
  return { entries: skus.map(prepareSku) };
}

export function rankChannelRecipeNameCandidates(
  options: ChannelRecipeNameOption[],
  skusOrIndex: ChannelRecipeNameSku[] | ChannelRecipeNameIndex,
): ChannelRecipeNameEvidence[] {
  const preparedOptions = prepareOptions(options);
  const index = Array.isArray(skusOrIndex)
    ? createChannelRecipeNameIndex(skusOrIndex)
    : skusOrIndex;
  return index.entries
    .map((sku) => [
      ...preparedOptions.map((option) => scorePreparedCandidate(option, sku)),
      scoreStructuredCandidate(options, sku),
    ]
      .filter((item): item is ChannelRecipeNameEvidence => item !== null)
      .sort(compareEvidence)[0]!)
    .filter((item) => item.kind !== 'fuzzy_name' || item.score >= 0.45)
    .sort(compareEvidence)
    .slice(0, 5);
}

function scorePreparedCandidate(
  channel: PreparedChannelName,
  sku: PreparedSkuName,
): ChannelRecipeNameEvidence {
  const exact = channel.value.length >= 4 && channel.value === sku.value;
  const contained = !exact
    && !(channel.source === 'listing' && sku.optionValue.length > 0)
    && Math.min(channel.value.length, sku.value.length) >= 6
    && (channel.value.includes(sku.value) || sku.value.includes(channel.value));
  return {
    kind: exact ? 'normalized_name' as const
      : contained ? 'contained_name' as const
        : 'fuzzy_name' as const,
    channelValue: channel.channelValue,
    normalizedValue: channel.value,
    score: diceCoefficient(channel, sku),
    sku: sku.sku,
  };
}

function prepareOptions(
  options: ChannelRecipeNameOption[],
): PreparedChannelName[] {
  return options.flatMap((option) => {
    const listingName = option.listingName?.trim() ?? '';
    const itemName = option.itemName?.trim() ?? '';
    const channelValues: Array<{
      channelValue: string;
      source: PreparedChannelName['source'];
    }> = [
      { channelValue: listingName, source: 'listing' },
      { channelValue: itemName, source: 'item' },
      { channelValue: [listingName, itemName].filter(Boolean).join(' '), source: 'combined' },
    ];
    return channelValues.filter(({ channelValue }, index) => channelValue
      && channelValues.findIndex((candidate) => candidate.channelValue === channelValue) === index)
      .map(({ channelValue, source }) => ({
      channelValue,
      source,
      ...prepareName(normalizeChannelRecipeName(channelValue)),
    }));
  });
}

function prepareSku(sku: ChannelRecipeNameSku): PreparedSkuName {
  const productValue = normalizeChannelRecipeName(sku.name);
  const optionValue = normalizeChannelRecipeName(sku.optionName);
  return {
    sku,
    productValue,
    optionValue,
    ...prepareName(`${productValue}${optionValue}`),
  };
}

function scoreStructuredCandidate(
  options: ChannelRecipeNameOption[],
  sku: PreparedSkuName,
): ChannelRecipeNameEvidence | null {
  if (sku.optionValue.length < 2 || sku.productValue.length < 4) return null;
  const evidence = options.flatMap((option) => {
    const listingValue = normalizeChannelRecipeName(option.listingName);
    const itemValue = normalizeChannelRecipeName(option.itemName);
    if (!itemValue.includes(sku.optionValue)) return [];
    const listing = prepareName(listingValue);
    const product = prepareName(sku.productValue);
    const productScore = diceCoefficient(listing, product);
    const productContained = Math.min(listingValue.length, sku.productValue.length) >= 6
      && (listingValue.includes(sku.productValue) || sku.productValue.includes(listingValue));
    if (listingValue !== sku.productValue && !productContained && productScore < 0.82) return [];
    return [{
      kind: 'contained_name' as const,
      channelValue: [option.listingName, option.itemName].filter(Boolean).join(' '),
      normalizedValue: `${listingValue}${itemValue}`,
      score: Math.max(0.9, (productScore + 1) / 2),
      sku: sku.sku,
    }];
  });
  return evidence.sort(compareEvidence)[0] ?? null;
}

function prepareName(value: string): PreparedName {
  const pairs = bigrams(value);
  const pairCounts = new Map<string, number>();
  for (const pair of pairs) {
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
  }
  return { value, pairCounts, pairCount: pairs.length };
}

function compareEvidence(
  left: ChannelRecipeNameEvidence,
  right: ChannelRecipeNameEvidence,
): number {
  return evidencePriority(right.kind) - evidencePriority(left.kind)
    || right.score - left.score
    || left.sku.code.localeCompare(right.sku.code)
    || left.sku.masterProductId.localeCompare(right.sku.masterProductId);
}

function evidencePriority(kind: ChannelRecipeNameEvidence['kind']): number {
  switch (kind) {
    case 'normalized_name': return 3;
    case 'contained_name': return 2;
    case 'fuzzy_name': return 1;
  }
}

function diceCoefficient(left: PreparedName, right: PreparedName): number {
  if (left.value === right.value && left.value.length > 0) return 1;
  if (left.pairCount === 0 || right.pairCount === 0) return 0;
  let shared = 0;
  const [smaller, larger] = left.pairCounts.size <= right.pairCounts.size
    ? [left.pairCounts, right.pairCounts]
    : [right.pairCounts, left.pairCounts];
  for (const [pair, count] of smaller) {
    shared += Math.min(count, larger.get(pair) ?? 0);
  }
  return (2 * shared) / (left.pairCount + right.pairCount);
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  return Array.from(
    { length: value.length - 1 },
    (_, index) => value.slice(index, index + 2),
  );
}
