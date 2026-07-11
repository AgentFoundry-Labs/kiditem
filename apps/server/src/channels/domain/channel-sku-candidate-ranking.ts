export type ChannelSkuEvidence = {
  sellerSku: string | null;
  modelNumber: string | null;
  barcode: string | null;
  productNames: string[];
  optionName: string | null;
};

export type CandidateInventorySku = {
  id: string;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
};

export type RankedInventorySkuCandidate = CandidateInventorySku & {
  reason:
    | 'exact_sellpia_code'
    | 'unique_barcode'
    | 'ambiguous_identifier'
    | 'name_suggestion'
    | 'manual_search';
  rank: number;
};

export type RankInventorySkuCandidatesInput = {
  evidence: ChannelSkuEvidence;
  exactCodeCandidates: CandidateInventorySku[];
  identifierCandidates: CandidateInventorySku[];
  nameSuggestionCandidates: CandidateInventorySku[];
  manualSearchCandidates: CandidateInventorySku[];
};

type CandidateMatch = {
  candidate: CandidateInventorySku;
  reason: RankedInventorySkuCandidate['reason'];
  exactSourcePriority: number;
};

const REASON_PRIORITY: Record<RankedInventorySkuCandidate['reason'], number> = {
  exact_sellpia_code: 0,
  unique_barcode: 1,
  ambiguous_identifier: 2,
  name_suggestion: 3,
  manual_search: 4,
};

export function rankInventorySkuCandidates(
  input: RankInventorySkuCandidatesInput,
): RankedInventorySkuCandidate[] {
  const matches = new Map<string, CandidateMatch>();
  const exactEvidence = exactSellpiaCodeEvidence(input.evidence);

  for (const candidate of input.exactCodeCandidates) {
    const sourcePriority = exactEvidence.get(candidate.sellpiaProductCode);
    if (sourcePriority === undefined) continue;
    keepStronger(matches, {
      candidate,
      reason: 'exact_sellpia_code',
      exactSourcePriority: sourcePriority,
    });
  }

  const normalizedEvidence = normalizedIdentifierEvidence(input.evidence);
  for (const identifier of normalizedEvidence) {
    const candidates = dedupeCandidates(input.identifierCandidates.filter(
      (candidate) => normalizeIdentifier(candidate.barcode) === identifier,
    ));
    const reason = candidates.length > 1 ? 'ambiguous_identifier' : 'unique_barcode';
    for (const candidate of candidates) {
      keepStronger(matches, {
        candidate,
        reason,
        exactSourcePriority: Number.POSITIVE_INFINITY,
      });
    }
  }

  for (const candidate of dedupeCandidates(input.nameSuggestionCandidates)) {
    keepStronger(matches, {
      candidate,
      reason: 'name_suggestion',
      exactSourcePriority: Number.POSITIVE_INFINITY,
    });
  }
  for (const candidate of dedupeCandidates(input.manualSearchCandidates)) {
    keepStronger(matches, {
      candidate,
      reason: 'manual_search',
      exactSourcePriority: Number.POSITIVE_INFINITY,
    });
  }

  return [...matches.values()]
    .sort(compareMatches)
    .map(({ candidate, reason }, rank) => ({ ...candidate, reason, rank }));
}

export function statusForUnmappedCandidates(
  candidates: RankedInventorySkuCandidate[],
): 'needs_review' | 'unmatched' {
  return candidates.some((candidate) =>
    candidate.reason === 'exact_sellpia_code'
    || candidate.reason === 'unique_barcode'
    || candidate.reason === 'ambiguous_identifier')
    ? 'needs_review'
    : 'unmatched';
}

export function extractExplicitOptionCodeTokens(optionName: string | null): string[] {
  if (!optionName) return [];
  const tokens = optionName.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g) ?? [];
  return [...new Set(tokens)];
}

export function normalizeIdentifier(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function exactSellpiaCodeEvidence(evidence: ChannelSkuEvidence): Map<string, number> {
  const values: Array<[string | null, number]> = [
    [evidence.sellerSku, 0],
    [evidence.modelNumber, 1],
    ...extractExplicitOptionCodeTokens(evidence.optionName).map(
      (token): [string, number] => [token, 2],
    ),
  ];
  const result = new Map<string, number>();
  for (const [rawValue, priority] of values) {
    const value = rawValue?.trim();
    if (!value) continue;
    const previous = result.get(value);
    if (previous === undefined || priority < previous) result.set(value, priority);
  }
  return result;
}

function normalizedIdentifierEvidence(evidence: ChannelSkuEvidence): string[] {
  const normalized = [evidence.modelNumber, evidence.barcode]
    .map(normalizeIdentifier)
    .filter((value): value is string => value !== null);
  return [...new Set(normalized)];
}

function dedupeCandidates(candidates: CandidateInventorySku[]): CandidateInventorySku[] {
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
}

function keepStronger(matches: Map<string, CandidateMatch>, incoming: CandidateMatch): void {
  const current = matches.get(incoming.candidate.id);
  if (!current || compareStrength(incoming, current) < 0) {
    matches.set(incoming.candidate.id, incoming);
  }
}

function compareStrength(left: CandidateMatch, right: CandidateMatch): number {
  const reasonComparison = REASON_PRIORITY[left.reason] - REASON_PRIORITY[right.reason];
  if (reasonComparison !== 0) return reasonComparison;
  if (left.reason !== 'exact_sellpia_code') return 0;
  return left.exactSourcePriority - right.exactSourcePriority;
}

function compareMatches(left: CandidateMatch, right: CandidateMatch): number {
  const strengthComparison = compareStrength(left, right);
  if (strengthComparison !== 0) return strengthComparison;
  const codeComparison = compareText(
    left.candidate.sellpiaProductCode,
    right.candidate.sellpiaProductCode,
  );
  return codeComparison !== 0
    ? codeComparison
    : compareText(left.candidate.id, right.candidate.id);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
