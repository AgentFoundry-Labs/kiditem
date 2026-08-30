const UUID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const CHANNEL_ORIGIN_INTERNAL_CODE = new RegExp(`^CP-(?:SKU-)?${UUID}$`, 'iu');
const SELLPIA_ORIGIN_INTERNAL_CODE = /^INV-SELLPIA-/iu;

export function isInternalProductCode(code: string): boolean {
  const normalized = code.trim();
  return SELLPIA_ORIGIN_INTERNAL_CODE.test(normalized)
    || CHANNEL_ORIGIN_INTERNAL_CODE.test(normalized);
}

export function operatorProductReference(code: string, name: string): string {
  return isInternalProductCode(code) ? name : `${code} · ${name}`;
}
