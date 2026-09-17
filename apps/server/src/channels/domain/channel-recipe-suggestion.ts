export type ChannelRecipeSuggestionStatus =
  | 'already_configured'
  | 'unique_code'
  | 'unique_barcode'
  | 'confirmed_manual_match_alias'
  | 'exact_name_option'
  | 'exact_name'
  | 'high_confidence_name'
  | 'identifier_name_mismatch'
  | 'quantity_review'
  | 'conflict'
  | 'ambiguous'
  | 'name_review_only'
  | 'no_match';

export type ChannelRecipeSuggestionDecision =
  | 'auto_apply'
  | 'quantity_review'
  | 'operator_review'
  | 'blocked'
  | 'already_configured';

export type ChannelRecipeSuggestionEvidenceKind =
  | 'seller_sku_code'
  | 'model_number_code'
  | 'physical_barcode'
  | 'sellpia_manual_match_alias'
  | 'normalized_name'
  | 'normalized_name_option'
  | 'contained_name'
  | 'fuzzy_name';

export type ChannelRecipeSuggestionSku = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number | null;
};

type CodeEvidence = {
  kind: 'seller_sku_code' | 'model_number_code';
  channelValue: string;
  nameCompatibilityScore?: number | null;
  sku: ChannelRecipeSuggestionSku;
};

type BarcodeEvidence = {
  kind: 'unique_physical_barcode';
  channelValue: string;
  normalizedValue: string;
  nameCompatibilityScore?: number | null;
  sku: ChannelRecipeSuggestionSku;
};

type NameOptionEvidence = {
  productValue: string;
  optionValue: string | null;
  normalizedProductValue: string;
  normalizedOptionValue: string | null;
  sku: ChannelRecipeSuggestionSku;
};

type NameEvidence = {
  channelValue: string;
  normalizedValue: string;
  sku: ChannelRecipeSuggestionSku;
};

type SimilarityEvidence = {
  kind: 'normalized_name' | 'contained_name' | 'fuzzy_name';
  channelValue: string;
  normalizedValue: string;
  score: number;
  sku: ChannelRecipeSuggestionSku;
};

type ManualMatchEvidence = {
  channelValue: string;
  normalizedValue: string;
  quantity: number;
  sku: ChannelRecipeSuggestionSku;
};

export type ChannelRecipeSuggestionInput = {
  channelListingOptionId: string;
  masterProductId: string | null;
  options: Array<{
    channelListingOptionId: string;
    listingName: string | null;
    itemName: string | null;
    sellerSku: string | null;
    modelNumber: string | null;
    barcode: string | null;
  }>;
  existingComponents: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    quantity: number;
    source: 'manual' | 'deterministic';
    confirmedBy: string | null;
    confirmedAt: Date | string;
  }>;
  codeEvidence: CodeEvidence[];
  barcodeEvidence: BarcodeEvidence[];
  nameOptionEvidence: NameOptionEvidence[];
  nameEvidence: NameEvidence[];
  similarityEvidence: SimilarityEvidence[];
  manualMatchEvidence: ManualMatchEvidence[];
};

type ProposalEvidence = {
  kind: ChannelRecipeSuggestionEvidenceKind;
  channelValue: string;
  normalizedValue: string;
  score?: number;
};

type StrongEvidence = {
  identifier: string;
  source: 'code' | 'barcode' | 'name_option' | 'manual_match_alias';
  quantity?: number;
  sku: ChannelRecipeSuggestionSku;
  evidence: ProposalEvidence;
};

export type ChannelRecipeSuggestionResponse = {
  channelListingOptionId: string;
  masterProductId: string | null;
  status: ChannelRecipeSuggestionStatus;
  automationDecision: ChannelRecipeSuggestionDecision;
  recommendedQuantity: number | null;
  reason: string;
  existingComponents: ChannelRecipeSuggestionInput['existingComponents'];
  proposals: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number | null;
    evidence: ProposalEvidence[];
    requiresQuantityConfirmation: boolean;
    recommendedQuantity: number | null;
  }>;
};

export const BARCODE_NAME_COMPATIBILITY_THRESHOLD = 0.35;

/**
 * Reject known name mismatches; a missing comparison score remains unknown and
 * therefore admissible for legacy barcode-only evidence.
 */
export function isBarcodeEvidenceNameCompatible(
  score: number | null | undefined,
): boolean {
  return score === null || score === undefined || score >= BARCODE_NAME_COMPATIBILITY_THRESHOLD;
}

const PACK_TOKEN = /(?:\d+\s*(?:개입|개|입|팩|pcs?|p)(?![\p{L}\p{N}])|x\s*\d+|세트|묶음|구성|\bbundle\b|\bset\b)/giu;

export function normalizeRecipeIdentityText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.normalize('NFKC').toLocaleLowerCase().replace(/\s/gu, '');
  return normalized || null;
}

export function normalizeRecipeSuggestionName(value: string): string {
  return normalizeRecipeIdentityText(value) ?? '';
}

export function packSignature(...values: Array<string | null>): string[] {
  return [...new Set(values
    .flatMap((value) => value?.normalize('NFKC').toLocaleLowerCase().match(PACK_TOKEN) ?? [])
    .map((value) => value.replace(/\s/gu, '')))]
    .sort();
}

export function classifyChannelRecipeSuggestion(
  input: ChannelRecipeSuggestionInput,
): ChannelRecipeSuggestionResponse {
  const base = {
    channelListingOptionId: input.channelListingOptionId,
    masterProductId: input.masterProductId,
    existingComponents: input.existingComponents,
  };
  if (input.existingComponents.length > 0) {
    return {
      ...base,
      status: 'already_configured',
      automationDecision: 'already_configured',
      recommendedQuantity: null,
      reason: 'Existing recipe components are preserved',
      proposals: [],
    };
  }

  const strongEvidence = collectStrongEvidence(input);
  const rejectedBarcodeEvidence = input.barcodeEvidence
    .filter((item) => !isBarcodeEvidenceNameCompatible(item.nameCompatibilityScore))
    .map((item): StrongEvidence => ({
      identifier: `physical_barcode:${item.normalizedValue}`,
      source: 'barcode',
      sku: item.sku,
      evidence: {
        kind: 'physical_barcode',
        channelValue: item.channelValue,
        normalizedValue: item.normalizedValue,
      },
    }));
  if (rejectedBarcodeEvidence.length > 0) {
    return decision(
      base,
      reviewEvidence(input, [...strongEvidence, ...rejectedBarcodeEvidence]),
      'identifier_name_mismatch',
      'operator_review',
      null,
      'A typed barcode points to a name-incompatible Sellpia SKU and requires review',
    );
  }
  if (hasAmbiguousIdentifier(strongEvidence)) {
    return decision(base, strongEvidence, 'ambiguous', 'blocked', null,
      'One deterministic identifier resolves to multiple Sellpia SKUs');
  }

  const skuIds = new Set(strongEvidence.map((item) => item.sku.sellpiaInventorySkuId));
  if (skuIds.size > 1) {
    return decision(base, strongEvidence, 'conflict', 'blocked', null,
      'Deterministic identifiers resolve to different Sellpia SKUs');
  }

  if (skuIds.size === 1) {
    const sku = strongEvidence[0]!.sku;
    const manualMatchQuantities = [...new Set(strongEvidence
      .filter((item) => item.source === 'manual_match_alias')
      .map((item) => item.quantity!))].sort((left, right) => left - right);
    if (manualMatchQuantities.length > 1) {
      return decision(base, strongEvidence, 'quantity_review', 'quantity_review', null,
        'The Sellpia product match is confirmed, but historical quantities disagree');
    }
    const manualMatchQuantity = manualMatchQuantities[0];
    if (manualMatchQuantity !== undefined) {
      const explicitTitleQuantities = packCounts([
        ...input.options.flatMap((option) => [option.listingName, option.itemName]),
        ...input.manualMatchEvidence.map((item) => item.channelValue),
      ]).filter((quantity) => quantity > 1);
      if (
        explicitTitleQuantities.length > 0
        && (
          explicitTitleQuantities.length !== 1
          || explicitTitleQuantities[0] !== manualMatchQuantity
        )
      ) {
        return decision(base, strongEvidence, 'quantity_review', 'quantity_review', null,
          'The Sellpia product match is confirmed, but the explicit title quantity disagrees');
      }
    }
    if (input.manualMatchEvidence.length === 0 && identifierNameMismatch(input)) {
      return decision(base, strongEvidence, 'identifier_name_mismatch', 'operator_review', null,
        'The exact identifier points to a Sellpia SKU with an incompatible product name');
    }
    const quantity = manualMatchQuantity
      ?? inferRecipeQuantity(
        input.options.flatMap((option) => [option.listingName, option.itemName]),
      );
    if (quantity === null) {
      return decision(base, strongEvidence, 'quantity_review', 'quantity_review', null,
        'The channel pack cannot be converted to a verified Sellpia unit quantity');
    }
    const status = automaticStatus(strongEvidence);
    return decision(base, strongEvidence, status, 'auto_apply', quantity, automaticReason(status));
  }

  if (input.nameEvidence.length > 0) {
    return looseNameDecision(base, input.nameEvidence, 'name_review_only', 'operator_review', null,
      'The exact product name has an unresolved option or specification mismatch');
  }

  const similarityDecision = decideSimilarity(base, input);
  if (similarityDecision) return similarityDecision;
  if (input.nameEvidence.length > 0) {
    return looseNameDecision(base, input.nameEvidence, 'name_review_only', 'operator_review', null,
      'Several Sellpia SKUs share the exact normalized product name');
  }
  return {
    ...base,
    status: 'no_match',
    automationDecision: 'blocked',
    recommendedQuantity: null,
    reason: 'No deterministic Sellpia evidence was found',
    proposals: [],
  };
}

function collectStrongEvidence(input: ChannelRecipeSuggestionInput): StrongEvidence[] {
  return [
    ...input.codeEvidence.map((item): StrongEvidence => ({
      identifier: `${item.kind}:${item.channelValue}`,
      source: 'code',
      sku: item.sku,
      evidence: {
        kind: item.kind,
        channelValue: item.channelValue,
        normalizedValue: item.channelValue,
      },
    })),
    ...input.barcodeEvidence
      .filter((item) => isBarcodeEvidenceNameCompatible(item.nameCompatibilityScore))
      .map((item): StrongEvidence => ({
        identifier: `physical_barcode:${item.normalizedValue}`,
        source: 'barcode',
        sku: item.sku,
        evidence: {
          kind: 'physical_barcode',
          channelValue: item.channelValue,
          normalizedValue: item.normalizedValue,
        },
      })),
    ...input.nameOptionEvidence.map((item): StrongEvidence => ({
      identifier: `name_option:${item.normalizedProductValue}:${item.normalizedOptionValue ?? ''}`,
      source: 'name_option',
      sku: item.sku,
      evidence: {
        kind: 'normalized_name_option',
        channelValue: joinIdentity(item.productValue, item.optionValue),
        normalizedValue: joinIdentity(item.normalizedProductValue, item.normalizedOptionValue),
      },
    })),
    ...input.manualMatchEvidence.map((item): StrongEvidence => ({
      identifier: `sellpia_manual_match_alias:${item.normalizedValue}`,
      source: 'manual_match_alias',
      quantity: item.quantity,
      sku: item.sku,
      evidence: {
        kind: 'sellpia_manual_match_alias',
        channelValue: item.channelValue,
        normalizedValue: item.normalizedValue,
      },
    })),
  ];
}

function hasAmbiguousIdentifier(evidence: StrongEvidence[]): boolean {
  const identifiers = new Map<string, Set<string>>();
  for (const item of evidence) {
    const skuIds = identifiers.get(item.identifier) ?? new Set<string>();
    skuIds.add(item.sku.sellpiaInventorySkuId);
    identifiers.set(item.identifier, skuIds);
  }
  return [...identifiers.values()].some((skuIds) => skuIds.size > 1);
}

export function inferRecipeQuantity(
  channelValues: Array<string | null>,
): number | null {
  const quantities = packCounts(channelValues);
  if (quantities.length === 0) {
    return channelValues.some((value) => value && EXPLICIT_SINGLE_UNIT.test(value)) ? 1 : null;
  }
  return quantities.length === 1 ? quantities[0]! : null;
}

const EXPLICIT_SINGLE_UNIT = /(?:단품|단일상품|낱개)(?:\s|$|[()[\]{}])/iu;

function packCounts(values: Array<string | null>): number[] {
  const counts = new Set<number>();
  for (const value of values) {
    if (!value) continue;
    for (const count of titleQuantityCounts(value)) counts.add(count);
  }
  return [...counts].sort((left, right) => left - right);
}

const QUANTITY_UNIT = String.raw`(?:개입|pcs?|피스|세트|묶음|구성|팩|ea|개|입|권|매|장|봉|종|p)`;
const QUANTITY_UNIT_TOKEN = new RegExp(
  String.raw`(?<![\p{N}.])(\d+)\s*${QUANTITY_UNIT}(?![\p{L}\p{N}])`,
  'giu',
);
const QUANTITY_UNIT_MULTIPLIER = new RegExp(
  String.raw`(?<![\p{N}.])(\d+)\s*${QUANTITY_UNIT}\s*[x×*]\s*(\d+)(?:\s*${QUANTITY_UNIT}(?![\p{L}\p{N}])|(?!\s*[\p{L}\p{N}.×x*]))`,
  'giu',
);
const QUANTITY_MULTIPLIER_WITH_UNIT = new RegExp(
  String.raw`(?<![\p{N}.])(\d+)\s*[x×*]\s*(\d+)\s*${QUANTITY_UNIT}(?![\p{L}\p{N}])`,
  'giu',
);
const CHOICE_OF_ONE = /\d+\s*종\s*(?:중\s*)?(?:택\s*1|랜덤\s*1)/giu;
const ADDITIVE_QUANTITY = /\d+(?:\s*\+\s*\d+)+/gu;

function titleQuantityCounts(value: string): number[] {
  const normalized = value.normalize('NFKC').toLocaleLowerCase();
  const counts = new Set<number>();
  const coveredRanges: Array<{ start: number; end: number }> = [];
  const cover = (match: RegExpMatchArray) => {
    const start = match.index ?? 0;
    coveredRanges.push({ start, end: start + match[0].length });
  };
  const add = (value: number) => {
    if (Number.isSafeInteger(value) && value > 0) counts.add(value);
  };

  for (const match of normalized.matchAll(CHOICE_OF_ONE)) {
    add(1);
    cover(match);
  }
  for (const match of normalized.matchAll(ADDITIVE_QUANTITY)) {
    const count = (match[0].match(/\d+/gu) ?? [])
      .map(Number)
      .reduce((sum, unit) => sum + unit, 0);
    add(count);
    cover(match);
  }
  for (const match of normalized.matchAll(QUANTITY_UNIT_MULTIPLIER)) {
    add(Number(match[1]) * Number(match[2]));
    cover(match);
  }
  for (const match of normalized.matchAll(QUANTITY_MULTIPLIER_WITH_UNIT)) {
    add(Number(match[1]) * Number(match[2]));
    cover(match);
  }
  for (const match of normalized.matchAll(QUANTITY_UNIT_TOKEN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (coveredRanges.some((range) => start < range.end && end > range.start)) {
      continue;
    }
    add(Number(match[1]));
  }
  return [...counts];
}

function identifierNameMismatch(input: ChannelRecipeSuggestionInput): boolean {
  if (input.nameOptionEvidence.length > 0) return false;
  const scores = [
    ...input.codeEvidence.map((item) => item.nameCompatibilityScore),
    ...input.barcodeEvidence
      .filter((item) => isBarcodeEvidenceNameCompatible(item.nameCompatibilityScore))
      .map((item) => item.nameCompatibilityScore),
  ].filter((score): score is number => score !== null && score !== undefined);
  return scores.length > 0
    && Math.max(...scores) < BARCODE_NAME_COMPATIBILITY_THRESHOLD;
}

function looseNameDecision(
  base: Pick<ChannelRecipeSuggestionResponse,
    'channelListingOptionId' | 'masterProductId' | 'existingComponents'>,
  evidence: NameEvidence[],
  status: ChannelRecipeSuggestionStatus,
  automationDecision: ChannelRecipeSuggestionDecision,
  recommendedQuantity: number | null,
  reason: string,
): ChannelRecipeSuggestionResponse {
  return {
    ...base,
    status,
    automationDecision,
    recommendedQuantity,
    reason,
    proposals: proposalsFromLooseNameEvidence(evidence, recommendedQuantity),
  };
}

function decideSimilarity(
  base: Pick<ChannelRecipeSuggestionResponse,
    'channelListingOptionId' | 'masterProductId' | 'existingComponents'>,
  input: ChannelRecipeSuggestionInput,
): ChannelRecipeSuggestionResponse | null {
  const evidence = bestSimilarityPerSku(input.similarityEvidence);
  const best = evidence[0];
  if (!best) return null;
  if (hasOptionOrSpecificationConflict(input.options, best.sku)) {
    return similarityDecision(base, evidence, 'name_review_only', 'operator_review', null,
      'The strongest name candidate conflicts with the channel option or specification');
  }
  const runnerUp = evidence[1];
  const margin = runnerUp ? best.score - runnerUp.score : 1;
  const automatic = (best.kind === 'normalized_name' && margin >= 0.12)
    || (best.kind === 'contained_name'
      && best.score >= 0.6
      && margin >= 0.12
      && runnerUp?.kind !== 'normalized_name'
      && runnerUp?.kind !== 'contained_name')
    || (best.kind === 'fuzzy_name' && best.score >= 0.82 && margin >= 0.12);
  if (!automatic) {
    return similarityDecision(base, evidence, 'name_review_only', 'operator_review', null,
      'Name candidates are close or below the automatic confidence threshold');
  }
  const names = input.options.flatMap((option) => [option.listingName, option.itemName]);
  const quantity = inferRecipeQuantity(names) ?? singleUnitForExactName(best, names);
  if (quantity === null) {
    return similarityDecision(base, evidence, 'quantity_review', 'quantity_review', null,
      'The matched name has an unverified channel-to-Sellpia pack ratio');
  }
  return similarityDecision(base, [best], 'high_confidence_name', 'auto_apply', quantity,
    best.kind === 'normalized_name'
      ? 'One unique exact normalized product identity was found'
      : 'One unique high-confidence Sellpia name candidate was found');
}

function reviewEvidence(
  input: ChannelRecipeSuggestionInput,
  evidence: StrongEvidence[],
): StrongEvidence[] {
  const seen = new Set(evidence.map((item) => item.sku.sellpiaInventorySkuId));
  const add = (
    sku: ChannelRecipeSuggestionSku,
    item: StrongEvidence['evidence'],
  ) => {
    if (seen.has(sku.sellpiaInventorySkuId)) return;
    seen.add(sku.sellpiaInventorySkuId);
    evidence.push({
      identifier: `review:${sku.sellpiaInventorySkuId}`,
      source: 'name_option',
      sku,
      evidence: item,
    });
  };
  for (const item of input.nameOptionEvidence) {
    add(item.sku, {
      kind: 'normalized_name_option',
      channelValue: joinIdentity(item.productValue, item.optionValue),
      normalizedValue: joinIdentity(
        item.normalizedProductValue,
        item.normalizedOptionValue,
      ),
    });
  }
  for (const item of input.nameEvidence) {
    add(item.sku, {
      kind: 'normalized_name',
      channelValue: item.channelValue,
      normalizedValue: item.normalizedValue,
    });
  }
  for (const item of bestSimilarityPerSku(input.similarityEvidence)) {
    add(item.sku, {
      kind: item.kind,
      channelValue: item.channelValue,
      normalizedValue: item.normalizedValue,
      score: item.score,
    });
  }
  return evidence;
}

function hasOptionOrSpecificationConflict(
  options: ChannelRecipeSuggestionInput['options'],
  sku: ChannelRecipeSuggestionSku,
): boolean {
  const skuOption = normalizeOptionValue(sku.optionName);
  const channelOptions = options
    .map((option) => normalizeOptionValue(option.itemName))
    .filter(Boolean);
  if (skuOption) {
    if (channelOptions.length === 0) return true;
    if (!channelOptions.some((value) =>
      value.includes(skuOption) || skuOption.includes(value))) return true;
  }

  const channelAttributes = extractComparableAttributes(
    options.flatMap((option) => [option.listingName, option.itemName]),
  );
  const skuAttributes = extractComparableAttributes([sku.name, sku.optionName]);
  for (const group of ['color', 'measure'] as const) {
    const channel = channelAttributes[group];
    const sellpia = skuAttributes[group];
    if (channel.size > 0 && sellpia.size > 0
      && ![...channel].some((value) => sellpia.has(value))) return true;
  }
  return false;
}

function normalizeOptionValue(value: string | null): string {
  if (!value) return '';
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/\d+\s*(?:개입|개|입|팩|pcs?|p|ea|세트|묶음|권|매|장|봉)/giu, '')
    .replace(/(?:단품|단일상품|낱개|기본옵션|기본|옵션없음|default)/giu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

const COLOR_ATTRIBUTES = [
  '빨강', '레드', '주황', '오렌지', '노랑', '옐로', '초록', '그린', '파랑', '블루',
  '남색', '네이비', '보라', '퍼플', '분홍', '핑크', '흰색', '화이트', '검정', '블랙',
  '회색', '그레이', '갈색', '브라운', '베이지', '투명', '클리어',
] as const;
const MEASURE_ATTRIBUTE = /(?<![\p{L}\p{N}.])(\d+(?:\.\d+)?)\s*(mm|cm|kg|mg|ml|g|l|호|인치|inch|색)(?![\p{L}\p{N}])/giu;

function extractComparableAttributes(values: Array<string | null>): {
  color: Set<string>;
  measure: Set<string>;
} {
  const normalized = values.filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
  const color = new Set(COLOR_ATTRIBUTES.filter((value) => normalized.includes(value)));
  const measure = new Set([...normalized.matchAll(MEASURE_ATTRIBUTE)]
    .map((match) => `${match[1]}${match[2]}`));
  return { color, measure };
}

/**
 * 채널 이름이 그 셀피아 상품 이름과 **글자까지 같고** 어디에도 묶음 표기가 없으면 낱개 하나다.
 *
 * 몰은 묶음을 팔 때 제목에 그 수를 적는다(`1p` · `[12개]` · `(12개입)`). 그 표기가 하나도
 * 없는데 이름이 상품 이름과 정확히 일치하면, 그 리스팅은 그 상품 하나다 — 키드키즈의
 * 송장용 상품명이 대표적이다(사장님 2026-09-17: "송장명이 맞는거 같은데").
 *
 * 수가 적혀 있는데 서로 어긋날 때(`2개입`과 `5개`가 같이 있는 경우)는 여기서 1로 접지
 * 않는다 — 그건 모르는 것이지 낱개라는 뜻이 아니다. 이름이 정확히 같지 않은 후보
 * (포함 · 유사)도 제외한다.
 */
function singleUnitForExactName(
  best: SimilarityEvidence,
  names: Array<string | null>,
): number | null {
  return best.kind === 'normalized_name' && packCounts(names).length === 0 ? 1 : null;
}

function bestSimilarityPerSku(evidence: SimilarityEvidence[]): SimilarityEvidence[] {
  const bySku = new Map<string, SimilarityEvidence>();
  for (const item of evidence) {
    const previous = bySku.get(item.sku.sellpiaInventorySkuId);
    if (!previous || item.score > previous.score) {
      bySku.set(item.sku.sellpiaInventorySkuId, item);
    }
  }
  return [...bySku.values()].sort((left, right) =>
    similarityPriority(right.kind) - similarityPriority(left.kind)
      || right.score - left.score
      || left.sku.code.localeCompare(right.sku.code));
}

function similarityPriority(kind: SimilarityEvidence['kind']): number {
  switch (kind) {
    case 'normalized_name': return 3;
    case 'contained_name': return 2;
    case 'fuzzy_name': return 1;
  }
}

function similarityDecision(
  base: Pick<ChannelRecipeSuggestionResponse,
    'channelListingOptionId' | 'masterProductId' | 'existingComponents'>,
  evidence: SimilarityEvidence[],
  status: ChannelRecipeSuggestionStatus,
  automationDecision: ChannelRecipeSuggestionDecision,
  recommendedQuantity: number | null,
  reason: string,
): ChannelRecipeSuggestionResponse {
  return {
    ...base,
    status,
    automationDecision,
    recommendedQuantity,
    reason,
    proposals: evidence.map((item) => proposal(item.sku, [{
      kind: item.kind,
      channelValue: item.channelValue,
      normalizedValue: item.normalizedValue,
      score: item.score,
    }], automationDecision === 'auto_apply' ? recommendedQuantity : null)),
  };
}

function automaticStatus(
  evidence: StrongEvidence[],
): Extract<ChannelRecipeSuggestionStatus,
  'unique_code' | 'unique_barcode' | 'exact_name_option' | 'confirmed_manual_match_alias'> {
  if (evidence.some((item) => item.source === 'manual_match_alias')) {
    return 'confirmed_manual_match_alias';
  }
  if (evidence.some((item) => item.source === 'code')) return 'unique_code';
  if (evidence.some((item) => item.source === 'barcode')) return 'unique_barcode';
  return 'exact_name_option';
}

function decision(
  base: Pick<ChannelRecipeSuggestionResponse,
    'channelListingOptionId' | 'masterProductId' | 'existingComponents'>,
  evidence: StrongEvidence[],
  status: ChannelRecipeSuggestionStatus,
  automationDecision: ChannelRecipeSuggestionDecision,
  recommendedQuantity: number | null,
  reason: string,
): ChannelRecipeSuggestionResponse {
  return {
    ...base,
    status,
    automationDecision,
    recommendedQuantity,
    reason,
    proposals: proposalsFromStrongEvidence(evidence, recommendedQuantity),
  };
}

function proposalsFromStrongEvidence(
  evidence: StrongEvidence[],
  recommendedQuantity: number | null,
): ChannelRecipeSuggestionResponse['proposals'] {
  const bySku = new Map<string, StrongEvidence[]>();
  for (const item of evidence) {
    const values = bySku.get(item.sku.sellpiaInventorySkuId) ?? [];
    values.push(item);
    bySku.set(item.sku.sellpiaInventorySkuId, values);
  }
  return [...bySku.values()].map((items) => proposal(
    items[0]!.sku,
    items.map((item) => item.evidence),
    recommendedQuantity,
  )).sort((left, right) => left.code.localeCompare(right.code));
}

function proposalsFromLooseNameEvidence(
  nameEvidence: NameEvidence[],
  recommendedQuantity: number | null,
): ChannelRecipeSuggestionResponse['proposals'] {
  const bySku = new Map<string, NameEvidence[]>();
  for (const item of nameEvidence) {
    const values = bySku.get(item.sku.sellpiaInventorySkuId) ?? [];
    values.push(item);
    bySku.set(item.sku.sellpiaInventorySkuId, values);
  }
  return [...bySku.values()].map((items) => proposal(
    items[0]!.sku,
    items.map((item) => ({
      kind: 'normalized_name',
      channelValue: item.channelValue,
      normalizedValue: item.normalizedValue,
    })),
    recommendedQuantity,
  )).sort((left, right) => left.code.localeCompare(right.code));
}

function proposal(
  sku: ChannelRecipeSuggestionSku,
  evidence: ProposalEvidence[],
  recommendedQuantity: number | null,
): ChannelRecipeSuggestionResponse['proposals'][number] {
  return {
    sellpiaInventorySkuId: sku.sellpiaInventorySkuId,
    code: sku.code,
    name: sku.name,
    optionName: sku.optionName,
    currentStock: sku.currentStock,
    evidence,
    requiresQuantityConfirmation: recommendedQuantity === null,
    recommendedQuantity,
  };
}

function joinIdentity(productValue: string, optionValue: string | null): string {
  return optionValue === null ? productValue : `${productValue} / ${optionValue}`;
}

function automaticReason(
  status: Extract<ChannelRecipeSuggestionStatus,
    'unique_code' | 'unique_barcode' | 'exact_name_option' | 'confirmed_manual_match_alias'>,
): string {
  switch (status) {
    case 'confirmed_manual_match_alias':
      return 'One exact Sellpia manual-match alias and quantity were found';
    case 'unique_code': return 'One exact Sellpia code candidate was found';
    case 'unique_barcode': return 'One unique physical barcode candidate was found';
    case 'exact_name_option': return 'One exact normalized product and option candidate was found';
  }
}
