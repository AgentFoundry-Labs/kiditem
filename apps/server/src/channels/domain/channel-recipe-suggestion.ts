export type ChannelRecipeSuggestionStatus =
  | 'already_configured'
  | 'unique_code'
  | 'unique_barcode'
  | 'exact_name_option'
  | 'exact_name'
  | 'high_confidence_name'
  | 'identifier_name_mismatch'
  | 'quantity_review'
  | 'conflict'
  | 'ambiguous'
  | 'name_review_only'
  | 'no_match';

export type ChannelRecipeAutomationDecision =
  | 'auto_apply'
  | 'operator_review'
  | 'blocked'
  | 'already_configured';

export type ChannelRecipeSuggestionEvidenceKind =
  | 'seller_sku_code'
  | 'model_number_code'
  | 'physical_barcode'
  | 'normalized_name'
  | 'normalized_name_option'
  | 'contained_name'
  | 'fuzzy_name';

export type ChannelRecipeSuggestionSku = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
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

export type ChannelRecipeSuggestionInput = {
  channelListingOptionId: string;
  productVariantId: string | null;
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
};

type ProposalEvidence = {
  kind: ChannelRecipeSuggestionEvidenceKind;
  channelValue: string;
  normalizedValue: string;
  score?: number;
};

type StrongEvidence = {
  identifier: string;
  source: 'code' | 'barcode' | 'name_option';
  sku: ChannelRecipeSuggestionSku;
  evidence: ProposalEvidence;
};

export type ChannelRecipeSuggestionResponse = {
  channelListingOptionId: string;
  productVariantId: string | null;
  masterProductId: string | null;
  status: ChannelRecipeSuggestionStatus;
  automationDecision: ChannelRecipeAutomationDecision;
  recommendedQuantity: number | null;
  reason: string;
  existingComponents: ChannelRecipeSuggestionInput['existingComponents'];
  proposals: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number;
    evidence: ProposalEvidence[];
    requiresQuantityConfirmation: boolean;
    recommendedQuantity: number | null;
  }>;
};

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
    productVariantId: input.productVariantId,
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
    if (identifierNameMismatch(input)) {
      return decision(base, strongEvidence, 'identifier_name_mismatch', 'operator_review', null,
        'The exact identifier points to a Sellpia SKU with an incompatible product name');
    }
    const quantity = inferRecipeQuantity(
      input.options.flatMap((option) => [option.listingName, option.itemName]),
      sku,
    );
    if (quantity === null) {
      return decision(base, strongEvidence, 'quantity_review', 'operator_review', null,
        'The channel pack cannot be converted to a verified Sellpia unit quantity');
    }
    const status = automaticStatus(strongEvidence);
    return decision(base, strongEvidence, status, 'auto_apply', quantity, automaticReason(status));
  }

  if (input.nameEvidence.length > 0) {
    const exactSkuIds = new Set(input.nameEvidence.map((item) =>
      item.sku.sellpiaInventorySkuId));
    if (exactSkuIds.size === 1) {
      const quantity = inferRecipeQuantity(
        input.options.flatMap((option) => [option.listingName, option.itemName]),
        input.nameEvidence[0]!.sku,
      );
      if (quantity !== null) {
        return looseNameDecision(base, input.nameEvidence, 'exact_name', 'auto_apply', quantity,
          'One unique exact normalized Sellpia product name was found');
      }
      return looseNameDecision(base, input.nameEvidence, 'quantity_review', 'operator_review', null,
        'The exact-name channel pack cannot be converted to a verified Sellpia unit quantity');
    }
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
    ...input.barcodeEvidence.map((item): StrongEvidence => ({
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
  sku: ChannelRecipeSuggestionSku,
): number | null {
  const channel = packCounts(channelValues);
  const physical = packCounts([sku.name, sku.optionName]);
  const channelMulti = channel.filter((count) => count > 1);
  if (channelMulti.length === 0) return 1;
  const physicalMulti = physical.filter((count) => count > 1);
  if (physicalMulti.length === 0) return null;
  if (channelMulti.some((count) => physicalMulti.includes(count))) return 1;
  const channelCount = Math.max(...channelMulti);
  const physicalCount = Math.max(...physicalMulti);
  const quantity = channelCount / physicalCount;
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

function packCounts(values: Array<string | null>): number[] {
  const counts = new Set<number>();
  const token = /(\d+)\s*(?:개입|개|입|팩|pcs?|p|ea|세트|묶음|권|매|장|봉)(?![\p{L}\p{N}])/giu;
  for (const value of values) {
    if (!value) continue;
    for (const match of value.normalize('NFKC').matchAll(token)) {
      const count = Number(match[1]);
      if (Number.isSafeInteger(count) && count > 0) counts.add(count);
    }
    for (const match of value.matchAll(/(\d+)\s*\+\s*(\d+)/gu)) {
      const count = Number(match[1]) + Number(match[2]);
      if (Number.isSafeInteger(count) && count > 0) counts.add(count);
    }
  }
  return [...counts].sort((left, right) => left - right);
}

function identifierNameMismatch(input: ChannelRecipeSuggestionInput): boolean {
  if (input.nameOptionEvidence.length > 0) return false;
  const scores = [
    ...input.codeEvidence.map((item) => item.nameCompatibilityScore),
    ...input.barcodeEvidence.map((item) => item.nameCompatibilityScore),
  ].filter((score): score is number => score !== null && score !== undefined);
  return scores.length > 0 && Math.max(...scores) < 0.35;
}

function looseNameDecision(
  base: Pick<ChannelRecipeSuggestionResponse,
    'channelListingOptionId' | 'productVariantId' | 'masterProductId' | 'existingComponents'>,
  evidence: NameEvidence[],
  status: ChannelRecipeSuggestionStatus,
  automationDecision: ChannelRecipeAutomationDecision,
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
    'channelListingOptionId' | 'productVariantId' | 'masterProductId' | 'existingComponents'>,
  input: ChannelRecipeSuggestionInput,
): ChannelRecipeSuggestionResponse | null {
  const evidence = bestSimilarityPerSku(input.similarityEvidence);
  const best = evidence[0];
  if (!best) return null;
  const runnerUp = evidence[1];
  const margin = runnerUp ? best.score - runnerUp.score : 1;
  const automatic = best.kind === 'normalized_name'
    || (best.kind === 'contained_name'
      && best.score >= 0.6
      && runnerUp?.kind !== 'normalized_name'
      && runnerUp?.kind !== 'contained_name')
    || (best.kind === 'fuzzy_name' && best.score >= 0.82 && margin >= 0.12);
  if (!automatic) {
    return similarityDecision(base, evidence, 'name_review_only', 'operator_review', null,
      'Name candidates are close or below the automatic confidence threshold');
  }
  const quantity = inferRecipeQuantity(
    input.options.flatMap((option) => [option.listingName, option.itemName]),
    best.sku,
  );
  if (quantity === null) {
    return similarityDecision(base, evidence, 'quantity_review', 'operator_review', null,
      'The matched name has an unverified channel-to-Sellpia pack ratio');
  }
  return similarityDecision(base, [best], 'high_confidence_name', 'auto_apply', quantity,
    best.kind === 'normalized_name'
      ? 'One unique exact normalized product identity was found'
      : 'One unique high-confidence Sellpia name candidate was found');
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
    'channelListingOptionId' | 'productVariantId' | 'masterProductId' | 'existingComponents'>,
  evidence: SimilarityEvidence[],
  status: ChannelRecipeSuggestionStatus,
  automationDecision: ChannelRecipeAutomationDecision,
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
): Extract<ChannelRecipeSuggestionStatus, 'unique_code' | 'unique_barcode' | 'exact_name_option'> {
  if (evidence.some((item) => item.source === 'code')) return 'unique_code';
  if (evidence.some((item) => item.source === 'barcode')) return 'unique_barcode';
  return 'exact_name_option';
}

function decision(
  base: Pick<ChannelRecipeSuggestionResponse,
    'channelListingOptionId' | 'productVariantId' | 'masterProductId' | 'existingComponents'>,
  evidence: StrongEvidence[],
  status: ChannelRecipeSuggestionStatus,
  automationDecision: ChannelRecipeAutomationDecision,
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
  status: Extract<ChannelRecipeSuggestionStatus, 'unique_code' | 'unique_barcode' | 'exact_name_option'>,
): string {
  switch (status) {
    case 'unique_code': return 'One exact Sellpia code candidate was found';
    case 'unique_barcode': return 'One unique physical barcode candidate was found';
    case 'exact_name_option': return 'One exact normalized product and option candidate was found';
  }
}
