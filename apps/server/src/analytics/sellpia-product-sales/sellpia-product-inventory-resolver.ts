export type SellpiaProductInventoryCandidate = Readonly<{
  masterProductId: string;
  code: string;
  sourceAccountKey: string;
  sourceProductCode: string;
  sourceOptionCode: string;
  barcode: string | null;
}>;

export type SellpiaProductInventoryEvidence = Readonly<{
  productCode: string;
  optionCode: string;
  barcode: string | null;
}>;

export type SellpiaProductInventoryCandidateResolution =
  | Readonly<{
    status: 'matched';
    masterProductId: string;
  }>
  | Readonly<{
    status: 'mapping_required';
    reason: 'not_found' | 'ambiguous_barcode';
    candidateCount: number;
  }>;

export function createSellpiaProductInventoryResolver(
  candidates: readonly SellpiaProductInventoryCandidate[],
): (evidence: SellpiaProductInventoryEvidence) =>
  SellpiaProductInventoryCandidateResolution {
  const bySourceIdentity = new Map(candidates.map((candidate) => [
    sourceIdentityKey(
      candidate.sourceAccountKey,
      candidate.sourceProductCode,
      candidate.sourceOptionCode,
    ),
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
    const productCode = evidence.productCode.trim();
    if (productCode) {
      const candidate = bySourceIdentity.get(sourceIdentityKey(
        'kiditem',
        productCode,
        evidence.optionCode.trim(),
      ));
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

function sourceIdentityKey(
  sourceAccountKey: string,
  sourceProductCode: string,
  sourceOptionCode: string,
): string {
  return [sourceAccountKey.trim(), sourceProductCode.trim(), sourceOptionCode.trim()]
    .join('\u0000');
}

function resolveSingle(
  candidate: SellpiaProductInventoryCandidate,
): SellpiaProductInventoryCandidateResolution {
  return {
    status: 'matched',
    masterProductId: candidate.masterProductId,
  };
}

function notFound(): SellpiaProductInventoryCandidateResolution {
  return {
    status: 'mapping_required',
    reason: 'not_found',
    candidateCount: 0,
  };
}
