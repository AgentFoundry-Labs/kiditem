export function normalizeSellpiaManualMatchAlias(value: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
