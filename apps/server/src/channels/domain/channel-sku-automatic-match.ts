export type AutomaticMatchEvidence = {
  productCode: string | null;
  barcode: string | null;
};

export type AutomaticMatchMaster = {
  id: string;
  code: string;
  barcode: string | null;
  isActive: boolean;
};

export type ChannelSkuAutomaticMatch =
  | {
    status: 'matched';
    source: 'product_code' | 'barcode';
    masterProductId: string;
    quantity: 1;
  }
  | { status: 'needs_review'; component: null }
  | { status: 'unmatched'; component: null };

export function resolveChannelSkuAutomaticMatch(
  evidence: AutomaticMatchEvidence,
  masters: readonly AutomaticMatchMaster[],
): ChannelSkuAutomaticMatch {
  const activeMasters = masters.filter(({ isActive }) => isActive);
  const productCode = normalizedValue(evidence.productCode);
  if (productCode) {
    const codeMatches = activeMasters.filter(
      ({ code }) => normalizedValue(code) === productCode,
    );
    if (codeMatches.length > 1) return { status: 'needs_review', component: null };
    if (codeMatches.length === 1) {
      return matched(codeMatches[0]!.id, 'product_code');
    }
  }

  const barcode = normalizedBarcode(evidence.barcode);
  if (barcode) {
    const barcodeMatches = activeMasters.filter(
      (master) => normalizedBarcode(master.barcode) === barcode,
    );
    if (barcodeMatches.length > 1) return { status: 'needs_review', component: null };
    if (barcodeMatches.length === 1) {
      return matched(barcodeMatches[0]!.id, 'barcode');
    }
  }

  return { status: 'unmatched', component: null };
}

function normalizedValue(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizedBarcode(value: string | null): string | null {
  const normalized = value?.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return normalized ? normalized : null;
}

function matched(
  masterProductId: string,
  source: 'product_code' | 'barcode',
): ChannelSkuAutomaticMatch {
  return { status: 'matched', source, masterProductId, quantity: 1 };
}
