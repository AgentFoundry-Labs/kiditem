import type {
  ChannelMatchCandidateReason,
  ChannelMatchEvidence,
  ChannelProductMatchCandidate,
} from '@kiditem/shared/channel-product-matching';

export type ChannelProductCandidate = Readonly<{
  id: string;
  code: string;
  name: string;
  category: string | null;
  brand: string | null;
  barcodes: readonly string[];
}>;

export type ChannelProductCandidateRankingInput = Readonly<{
  candidates: readonly ChannelProductCandidate[];
  confirmedMasterProductId?: string | null;
  providerIdentity?: string | null;
  explicitCode?: string | null;
  barcode?: string | null;
  name?: string | null;
  aiSuggestion?: Readonly<{
    masterProductId: string;
    explanation: string;
    score: number | null;
  }> | null;
  manualSearch?: string | null;
}>;

const REASON_PRIORITY: Record<ChannelMatchCandidateReason, number> = {
  existing_identity: 0,
  exact_code: 1,
  unique_barcode: 2,
  exact_normalized_name: 3,
  ai_suggestion: 4,
  manual_search: 5,
};

export function rankChannelProductCandidates(
  input: ChannelProductCandidateRankingInput,
): ChannelProductMatchCandidate[] {
  const ranked = new Map<string, {
    candidate: ChannelProductCandidate;
    reason: ChannelMatchCandidateReason;
    evidence: ChannelMatchEvidence;
  }>();
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const baseEvidence = emptyEvidence();

  if (input.confirmedMasterProductId && input.providerIdentity) {
    keep(ranked, byId.get(input.confirmedMasterProductId), 'existing_identity', {
      ...baseEvidence,
      providerIdentity: input.providerIdentity,
    });
  }

  const explicitCode = input.explicitCode?.trim().toLowerCase();
  if (explicitCode) {
    for (const candidate of input.candidates) {
      if (candidate.code.trim().toLowerCase() === explicitCode) {
        keep(ranked, candidate, 'exact_code', {
          ...baseEvidence,
          code: input.explicitCode!.trim(),
        });
      }
    }
  }

  const barcode = normalizeChannelBarcode(input.barcode ?? null);
  if (barcode) {
    const matches = input.candidates.filter((candidate) =>
      candidate.barcodes.some((value) => normalizeChannelBarcode(value) === barcode),
    );
    if (matches.length === 1) {
      keep(ranked, matches[0], 'unique_barcode', {
        ...baseEvidence,
        barcode,
      });
    }
  }

  const normalizedName = normalizeChannelMatchName(input.name ?? null);
  if (normalizedName) {
    for (const candidate of input.candidates) {
      if (normalizeChannelMatchName(candidate.name) === normalizedName) {
        keep(ranked, candidate, 'exact_normalized_name', {
          ...baseEvidence,
          normalizedName,
        });
      }
    }
  }

  if (input.aiSuggestion) {
    keep(ranked, byId.get(input.aiSuggestion.masterProductId), 'ai_suggestion', {
      ...baseEvidence,
      aiExplanation: input.aiSuggestion.explanation,
      score: input.aiSuggestion.score,
    });
  }

  const manualSearch = input.manualSearch?.trim().toLowerCase();
  if (manualSearch) {
    for (const candidate of input.candidates) {
      if (productSearchText(candidate).includes(manualSearch)) {
        keep(ranked, candidate, 'manual_search', {
          ...baseEvidence,
          normalizedName: manualSearch,
        });
      }
    }
  }

  return [...ranked.values()]
    .sort((left, right) =>
      REASON_PRIORITY[left.reason] - REASON_PRIORITY[right.reason]
      || left.candidate.code.localeCompare(right.candidate.code)
      || left.candidate.id.localeCompare(right.candidate.id))
    .map(({ candidate, reason, evidence }, index) => ({
      masterProductId: candidate.id,
      code: candidate.code,
      name: candidate.name,
      category: candidate.category,
      brand: candidate.brand,
      reason,
      evidence,
      rank: index + 1,
    }));
}

export function normalizeChannelMatchName(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.normalize('NFKC').toLowerCase().replace(/\s/gu, '');
  return normalized || null;
}

export function normalizeChannelBarcode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\D/g, '');
  return normalized.length >= 8 && normalized.length <= 14 ? normalized : null;
}

function keep(
  ranked: Map<string, {
    candidate: ChannelProductCandidate;
    reason: ChannelMatchCandidateReason;
    evidence: ChannelMatchEvidence;
  }>,
  candidate: ChannelProductCandidate | undefined,
  reason: ChannelMatchCandidateReason,
  evidence: ChannelMatchEvidence,
): void {
  if (!candidate) return;
  const current = ranked.get(candidate.id);
  if (!current || REASON_PRIORITY[reason] < REASON_PRIORITY[current.reason]) {
    ranked.set(candidate.id, { candidate, reason, evidence });
  }
}

function emptyEvidence(): ChannelMatchEvidence {
  return {
    providerIdentity: null,
    code: null,
    barcode: null,
    normalizedName: null,
    aiExplanation: null,
    score: null,
  };
}

function productSearchText(candidate: ChannelProductCandidate): string {
  return [candidate.code, candidate.name, candidate.category, candidate.brand]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}
