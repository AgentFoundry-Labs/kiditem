export type SellpiaProductInventoryCandidate = Readonly<{
  id: string;
  code: string;
  barcode: string | null;
  isActive: boolean;
}>;

export type SellpiaProductInventoryEvidence = Readonly<{
  productCode: string;
  optionCode: string;
  barcode: string | null;
}>;

export type SellpiaProductInventoryCandidateResolution =
  | Readonly<{
    status: 'matched';
    sellpiaInventorySkuId: string;
  }>
  | Readonly<{
    status: 'mapping_required';
    reason: 'not_found' | 'inactive_candidate' | 'ambiguous_barcode';
    candidateCount: number;
  }>;

export function createSellpiaProductInventoryResolver(
  candidates: readonly SellpiaProductInventoryCandidate[],
): (evidence: SellpiaProductInventoryEvidence) =>
  SellpiaProductInventoryCandidateResolution {
  const byCode = new Map(candidates.map((candidate) => [
    candidate.code.trim(),
    candidate,
  ]));
  const byBarcode = new Map<string, SellpiaProductInventoryCandidate[]>();
  for (const candidate of candidates) {
    const barcode = candidate.barcode?.trim();
    if (!barcode) continue;
    const entries = byBarcode.get(barcode) ?? [];
    entries.push(candidate);
    byBarcode.set(barcode, entries);
  }

  return (evidence) => {
    for (const code of [evidence.productCode, evidence.optionCode]) {
      const normalized = code.trim();
      if (!normalized) continue;
      const candidate = byCode.get(normalized);
      if (candidate) return resolveSingle(candidate);
    }

    const barcode = evidence.barcode?.trim();
    if (!barcode) return notFound();
    const barcodeCandidates = byBarcode.get(barcode) ?? [];
    if (barcodeCandidates.length === 0) return notFound();
    if (barcodeCandidates.length > 1) {
      return {
        status: 'mapping_required',
        reason: 'ambiguous_barcode',
        candidateCount: barcodeCandidates.length,
      };
    }
    return resolveSingle(barcodeCandidates[0]!);
  };
}

function resolveSingle(
  candidate: SellpiaProductInventoryCandidate,
): SellpiaProductInventoryCandidateResolution {
  if (!candidate.isActive) {
    return {
      status: 'mapping_required',
      reason: 'inactive_candidate',
      candidateCount: 1,
    };
  }
  return {
    status: 'matched',
    sellpiaInventorySkuId: candidate.id,
  };
}

function notFound(): SellpiaProductInventoryCandidateResolution {
  return {
    status: 'mapping_required',
    reason: 'not_found',
    candidateCount: 0,
  };
}
