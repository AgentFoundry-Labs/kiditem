import type {
  ChannelMatchCandidateReason,
  ChannelMatchEvidence,
  ChannelVariantMatchCandidate,
} from '@kiditem/shared/channel-product-matching';
import {
  normalizeChannelBarcode,
  normalizeChannelMatchName,
} from './channel-product-candidate-ranking';

export type ChannelVariantCandidate = Readonly<{
  id: string;
  masterProductId: string;
  code: string;
  name: string;
  optionLabel: string | null;
  barcodes: readonly string[];
}>;

export type ChannelVariantCandidateRankingInput = Readonly<{
  confirmedMasterProductId: string;
  candidates: readonly ChannelVariantCandidate[];
  confirmedProductVariantId?: string | null;
  providerIdentity?: string | null;
  explicitCode?: string | null;
  barcode?: string | null;
  name?: string | null;
  aiSuggestion?: Readonly<{
    productVariantId: string;
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

export function rankChannelVariantCandidates(
  input: ChannelVariantCandidateRankingInput,
): ChannelVariantMatchCandidate[] {
  const candidates = input.candidates.filter(
    (candidate) => candidate.masterProductId === input.confirmedMasterProductId,
  );
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ranked = new Map<string, {
    candidate: ChannelVariantCandidate;
    reason: ChannelMatchCandidateReason;
    evidence: ChannelMatchEvidence;
  }>();
  const baseEvidence = emptyEvidence();

  if (input.confirmedProductVariantId && input.providerIdentity) {
    keep(ranked, byId.get(input.confirmedProductVariantId), 'existing_identity', {
      ...baseEvidence,
      providerIdentity: input.providerIdentity,
    });
  }

  const explicitCode = input.explicitCode?.trim().toLowerCase();
  if (explicitCode) {
    for (const candidate of candidates) {
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
    const matches = candidates.filter((candidate) =>
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
    for (const candidate of candidates) {
      if (
        normalizeChannelMatchName(candidate.optionLabel ?? candidate.name)
        === normalizedName
      ) {
        keep(ranked, candidate, 'exact_normalized_name', {
          ...baseEvidence,
          normalizedName,
        });
      }
    }
  }

  if (input.aiSuggestion) {
    keep(ranked, byId.get(input.aiSuggestion.productVariantId), 'ai_suggestion', {
      ...baseEvidence,
      aiExplanation: input.aiSuggestion.explanation,
      score: input.aiSuggestion.score,
    });
  }

  const manualSearch = input.manualSearch?.trim().toLowerCase();
  if (manualSearch) {
    for (const candidate of candidates) {
      if ([candidate.code, candidate.name, candidate.optionLabel]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLowerCase()
        .includes(manualSearch)) {
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
      productVariantId: candidate.id,
      masterProductId: candidate.masterProductId,
      code: candidate.code,
      name: candidate.name,
      optionLabel: candidate.optionLabel,
      reason,
      evidence,
      rank: index + 1,
    }));
}

function keep(
  ranked: Map<string, {
    candidate: ChannelVariantCandidate;
    reason: ChannelMatchCandidateReason;
    evidence: ChannelMatchEvidence;
  }>,
  candidate: ChannelVariantCandidate | undefined,
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
