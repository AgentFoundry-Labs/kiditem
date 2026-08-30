import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import {
  type SourcingFinalDiscoveryCapabilityPort,
} from '../../../application/port/in/capability/sourcing-final-discovery-capability.port';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../../../application/port/out/repository/sourcing-candidate.repository.port';
import {
  SOURCING_BROWSER_SCRAPE_PORT,
  type SourcingBrowserScrapePort,
} from '../../../application/port/out/runtime/sourcing-browser-scrape.port';
import { extractSupplierOfferId, parseAllowedSupplierUrl } from '../../../domain/supplier-source-url-policy';
import {
  canonicalSourcingCandidateIdentity,
  normalizeSourcingVariantKey,
} from '../../../domain/sourcing-candidate-identity';
import type { SourcingSourceSnapshot } from '../../../application/port/in/capability/sourcing-final-capability.port';

/** Owner bridge for final discovery capabilities; raw browser records never cross this boundary. */
@Injectable()
export class SourcingFinalDiscoveryCapabilityAdapter implements SourcingFinalDiscoveryCapabilityPort {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_BROWSER_SCRAPE_PORT)
    private readonly browser: SourcingBrowserScrapePort,
  ) {}

  async duplicateCheck(input: { organizationId: string; sourceUrl: string }) {
    const supplier = parseAllowedSupplierUrl(input.sourceUrl);
    const existing = await this.candidates.findActiveBySourceUrl({
      organizationId: input.organizationId,
      sourceUrl: supplier.normalizedUrl,
    });
    return { duplicate: Boolean(existing), candidateId: existing?.id ?? null };
  }

  async scrapeProductUrl(input: { sourceUrl: string }): Promise<SourcingSourceSnapshot> {
    const supplier = parseAllowedSupplierUrl(input.sourceUrl);
    const output = await this.browser.scrapeProductUrl({ sourceUrl: supplier.normalizedUrl });
    if (output.ok !== true) throw new Error('sourcing_scrape_failed');
    const finalSupplier = typeof output.source_url === 'string'
      ? parseAllowedSupplierUrl(output.source_url)
      : supplier;
    const raw = record(output.scraped_data, 'sourcing_scrape_payload_invalid');
    const images = stringArray(raw.image_urls ?? raw.images);
    const snapshot = {
      sourceUrl: finalSupplier.normalizedUrl,
      platform: finalSupplier.platform,
      title: boundedText(raw.title ?? raw.product_name, 1_000),
      price: numberOrNull(raw.price ?? raw.cost_cny),
      currency: boundedText(raw.currency, 12) ?? 'CNY',
      variantKeyNormalized: normalizeSourcingVariantKey(raw.variant_key),
      images,
    } satisfies Omit<SourcingSourceSnapshot, 'contentHash'>;
    return { ...snapshot, contentHash: contentHash(snapshot) };
  }

  async ingestCandidate(input: {
    organizationId: string;
    initiatingUserId: string;
    idempotencyKey: string;
    requestHash: string;
    snapshot: SourcingSourceSnapshot;
  }) {
    if (!input.idempotencyKey.trim()) throw new Error('owner_idempotency_key_required');
    if (input.requestHash !== canonicalOwnerInputHash({ snapshot: input.snapshot })) {
      throw new Error('owner_idempotency_input_conflict');
    }
    const supplier = parseAllowedSupplierUrl(input.snapshot.sourceUrl);
    if (contentHash(snapshotContent(input.snapshot)) !== input.snapshot.contentHash) {
      throw new Error('sourcing_scrape_snapshot_hash_mismatch');
    }
    const externalOfferId = extractSupplierOfferId(supplier);
    const platform = supplier.platform === '1688' ? 'ALIBABA_1688' : 'ALIBABA';
    const variantKeyNormalized = normalizeSourcingVariantKey(
      input.snapshot.variantKeyNormalized,
    );
    return this.candidates.upsertSourcedWithIdempotencyReceipt({
      capabilityKey: 'sourcing.ingestCandidate',
      requestHash: input.requestHash,
      organizationId: input.organizationId,
      sourceUrl: supplier.normalizedUrl,
      sourcePlatform: platform,
      externalOfferId,
      variantKeyNormalized,
      sourceIdentityHash: canonicalSourcingCandidateIdentity({
        sourcePlatform: platform,
        sourceUrl: supplier.normalizedUrl,
        validatedExternalOfferId: externalOfferId,
        variantKeyNormalized,
      }),
      idempotencyKey: input.idempotencyKey,
      rawData: {
        source: 'agent_final_scrape',
        contentHash: input.snapshot.contentHash,
      },
      name: input.snapshot.title ?? supplier.normalizedUrl,
      description: '',
      category: null,
      tags: [],
      thumbnailUrl: input.snapshot.images[0] ?? null,
      imageUrl: input.snapshot.images[0] ?? null,
      costCny: input.snapshot.price,
      triggeredByUserId: input.initiatingUserId,
      images: input.snapshot.images.map((url, sortOrder) => ({ url, role: 'product', label: null, sortOrder, source: 'agent-final-scrape', isPrimary: sortOrder === 0 })),
    });
  }
}

function snapshotContent(snapshot: SourcingSourceSnapshot): Omit<SourcingSourceSnapshot, 'contentHash'> {
  const { contentHash: _contentHash, ...content } = snapshot;
  return content;
}
function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
}
function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const item of value) {
    const normalized = normalizedHttpsUrl(item);
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size === 40) break;
  }
  return [...deduped];
}
function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === 'string' && value.trim() && value.trim().length <= maximum ? value.trim() : null;
}
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
function normalizedHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
