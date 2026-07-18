export type ChannelRecipeNameOption = {
  listingName: string | null;
  itemName: string | null;
};

export type ChannelRecipeNameSku = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
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
const LEADING_PRICE = /^\s*\d{3,6}(?=[^\d]|$)/u;
const SINGLE_UNIT_LABEL = /(?:단품|단일상품|낱개)\s*$/giu;

export function normalizeChannelRecipeName(value: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/ky\s*i\s*&\s*d/giu, '')
    .replace(LEADING_PRICE, '')
    .replace(/\b(?:pack|box)\b/giu, '')
    .replace(SALES_UNIT_TOKEN, '')
    .replace(SINGLE_UNIT_LABEL, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
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
    || left.sku.sellpiaInventorySkuId.localeCompare(right.sku.sellpiaInventorySkuId);
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
