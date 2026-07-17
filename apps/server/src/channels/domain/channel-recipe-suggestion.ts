export type ChannelRecipeSuggestionStatus =
  | 'already_configured'
  | 'unique_code'
  | 'quantity_review'
  | 'conflict'
  | 'ambiguous'
  | 'name_review_only'
  | 'no_match';

export type ChannelRecipeSuggestionEvidenceKind =
  | 'seller_sku_code'
  | 'model_number_code'
  | 'normalized_name';

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
  sku: ChannelRecipeSuggestionSku;
};

type NameEvidence = {
  channelValue: string;
  normalizedValue: string;
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
  }>;
  existingComponents: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    quantity: number;
  }>;
  codeEvidence: CodeEvidence[];
  nameEvidence: NameEvidence[];
};

export type ChannelRecipeSuggestionResponse = {
  channelListingOptionId: string;
  productVariantId: string | null;
  masterProductId: string | null;
  status: ChannelRecipeSuggestionStatus;
  reason: string;
  existingComponents: ChannelRecipeSuggestionInput['existingComponents'];
  proposals: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number;
    evidence: Array<{
      kind: ChannelRecipeSuggestionEvidenceKind;
      channelValue: string;
      normalizedValue: string;
    }>;
    requiresQuantityConfirmation: true;
  }>;
};

const BUNDLE_LANGUAGE = /(?:\bbundle\b|\bset\b|세트|묶음|구성)/iu;

export function normalizeRecipeSuggestionName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, '');
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
    return { ...base, status: 'already_configured', reason: 'Existing recipe components are preserved', proposals: [] };
  }

  const codeEvidenceBySku = groupCodeEvidence(input.codeEvidence);
  const codeProposals = proposalsFromCodeEvidence(codeEvidenceBySku);
  if (codeProposals.length > 0) {
    const status = classifyCodeEvidence(input, codeEvidenceBySku);
    return {
      ...base,
      status,
      reason: codeReason(status),
      proposals: codeProposals,
    };
  }

  const nameProposals = proposalsFromNameEvidence(input.nameEvidence);
  if (nameProposals.length > 0) {
    return {
      ...base,
      status: 'name_review_only',
      reason: 'Normalized listing names are review-only evidence',
      proposals: nameProposals,
    };
  }
  return { ...base, status: 'no_match', reason: 'No deterministic Sellpia evidence was found', proposals: [] };
}

function classifyCodeEvidence(
  input: ChannelRecipeSuggestionInput,
  evidenceBySku: Map<string, CodeEvidence[]>,
): Extract<ChannelRecipeSuggestionStatus, 'unique_code' | 'quantity_review' | 'conflict' | 'ambiguous'> {
  const identifierMatches = new Map<string, Set<string>>();
  for (const evidence of input.codeEvidence) {
    const key = `${evidence.kind}:${evidence.channelValue}`;
    const matches = identifierMatches.get(key) ?? new Set<string>();
    matches.add(evidence.sku.sellpiaInventorySkuId);
    identifierMatches.set(key, matches);
  }
  if ([...identifierMatches.values()].some((matches) => matches.size > 1)) return 'ambiguous';
  if (evidenceBySku.size > 1) return 'conflict';
  const hasBundleLanguage = input.options.some((option) =>
    [option.listingName, option.itemName].some((value) => value !== null && BUNDLE_LANGUAGE.test(value)));
  return hasBundleLanguage ? 'quantity_review' : 'unique_code';
}

function groupCodeEvidence(codeEvidence: CodeEvidence[]): Map<string, CodeEvidence[]> {
  const bySku = new Map<string, CodeEvidence[]>();
  for (const evidence of codeEvidence) {
    const values = bySku.get(evidence.sku.sellpiaInventorySkuId) ?? [];
    values.push(evidence);
    bySku.set(evidence.sku.sellpiaInventorySkuId, values);
  }
  return bySku;
}

function proposalsFromCodeEvidence(
  evidenceBySku: Map<string, CodeEvidence[]>,
): ChannelRecipeSuggestionResponse['proposals'] {
  return [...evidenceBySku.values()].map((evidence) => {
    const sku = evidence[0]!.sku;
    return proposal(sku, evidence.map((item) => ({
      kind: item.kind,
      channelValue: item.channelValue,
      normalizedValue: item.channelValue,
    })));
  }).sort((left, right) => left.code.localeCompare(right.code));
}

function proposalsFromNameEvidence(
  nameEvidence: NameEvidence[],
): ChannelRecipeSuggestionResponse['proposals'] {
  const bySku = new Map<string, NameEvidence[]>();
  for (const evidence of nameEvidence) {
    const values = bySku.get(evidence.sku.sellpiaInventorySkuId) ?? [];
    values.push(evidence);
    bySku.set(evidence.sku.sellpiaInventorySkuId, values);
  }
  return [...bySku.values()].map((evidence) => proposal(
    evidence[0]!.sku,
    evidence.map((item) => ({
      kind: 'normalized_name' as const,
      channelValue: item.channelValue,
      normalizedValue: item.normalizedValue,
    })),
  )).sort((left, right) => left.code.localeCompare(right.code));
}

function proposal(
  sku: ChannelRecipeSuggestionSku,
  evidence: Array<{
    kind: ChannelRecipeSuggestionEvidenceKind;
    channelValue: string;
    normalizedValue: string;
  }>,
): ChannelRecipeSuggestionResponse['proposals'][number] {
  return {
    sellpiaInventorySkuId: sku.sellpiaInventorySkuId,
    code: sku.code,
    name: sku.name,
    optionName: sku.optionName,
    currentStock: sku.currentStock,
    evidence: evidence.map((item) => ({
      kind: item.kind,
      channelValue: item.channelValue,
      normalizedValue: item.normalizedValue,
    })),
    requiresQuantityConfirmation: true,
  };
}

function codeReason(status: ChannelRecipeSuggestionStatus): string {
  switch (status) {
    case 'unique_code': return 'One exact Sellpia code candidate was found';
    case 'quantity_review': return 'Exact code evidence has bundle or set language requiring quantity review';
    case 'conflict': return 'Exact code identifiers resolve to different Sellpia SKUs';
    case 'ambiguous': return 'An exact code identifier resolves to multiple Sellpia SKUs';
    default: return 'No deterministic Sellpia evidence was found';
  }
}
