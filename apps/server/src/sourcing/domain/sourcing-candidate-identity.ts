import { createHash } from 'node:crypto';

export function normalizeSourcingVariantKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

export function stableSourcingCandidateIdentity(
  sourcePlatform: string,
  externalOfferId: string,
  variantKeyNormalized: string,
): string {
  return createHash('sha256')
    .update(
      [
        sourcePlatform.trim().toLocaleLowerCase('en-US'),
        externalOfferId.trim(),
        variantKeyNormalized,
      ].join('\u001f'),
    )
    .digest('hex');
}
