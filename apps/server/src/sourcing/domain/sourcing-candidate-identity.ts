import { createHash } from 'node:crypto';

export function normalizeSourcingVariantKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

/**
 * One Sourcing-owned canonical candidate identity across every ingress.
 * Alibaba product IDs are collector provenance, not a stable supplier identity;
 * Alibaba therefore uses its already-normalized supplier URL.  1688 has a
 * canonical offer ID, with that same safe URL only as a fallback when absent.
 */
export function canonicalSourcingCandidateIdentity(input: {
  sourcePlatform: string;
  sourceUrl: string;
  /** Parsed from the normalized supplier URL; raw provider IDs remain provenance only. */
  validatedExternalOfferId?: string | null;
  variantKeyNormalized: string;
}): string {
  const sourcePlatform = input.sourcePlatform.trim().toLocaleUpperCase('en-US');
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) throw new TypeError('sourcing_candidate_identity_source_url_required');
  const externalOfferId = input.validatedExternalOfferId?.trim() || null;
  const identity = sourcePlatform === 'ALIBABA'
    ? `supplier-url:${sourceUrl}`
    : externalOfferId
      ? `external-offer:${externalOfferId}`
      : `supplier-url:${sourceUrl}`;
  return createHash('sha256')
    .update(
      [
        sourcePlatform.toLocaleLowerCase('en-US'),
        identity,
        normalizeSourcingVariantKey(input.variantKeyNormalized),
      ].join('\u001f'),
    )
    .digest('hex');
}

/** Shared transaction-lock coordinate for every canonical candidate writer. */
export function sourcingCandidateIdentityLockKey(input: {
  organizationId: string;
  sourcePlatform: string;
  sourceIdentityHash?: string | null;
  sourceUrl: string;
}): string {
  return [
    'sourcing-source-identity',
    input.organizationId,
    input.sourcePlatform,
    input.sourceIdentityHash ?? input.sourceUrl,
  ].join(':');
}
