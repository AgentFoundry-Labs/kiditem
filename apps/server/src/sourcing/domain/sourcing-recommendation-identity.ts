import { createHash } from 'node:crypto';

export interface RecommendationIdentityInput {
  sourcePlatform: string;
  externalOfferId: string;
  variantKey: string;
  matchedCoupangProductId: string | null;
}

function normalizePart(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s*=\s*/g, '=');
}

export function recommendationItemKey(input: RecommendationIdentityInput): string {
  const externalOfferId = input.externalOfferId.trim();
  if (!externalOfferId) {
    throw new TypeError('externalOfferId is required');
  }

  return createHash('sha256')
    .update(
      [
        normalizePart(input.sourcePlatform),
        externalOfferId,
        normalizePart(input.variantKey),
        input.matchedCoupangProductId?.trim() ?? '',
      ].join('\u001f'),
    )
    .digest('hex');
}
