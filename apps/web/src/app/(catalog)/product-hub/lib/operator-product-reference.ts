const CHANNEL_ORIGIN_INTERNAL_CODE = /^CP-(?:SKU-)?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

export function operatorProductReference(code: string, name: string): string {
  return CHANNEL_ORIGIN_INTERNAL_CODE.test(code.trim()) ? name : `${code} · ${name}`;
}
