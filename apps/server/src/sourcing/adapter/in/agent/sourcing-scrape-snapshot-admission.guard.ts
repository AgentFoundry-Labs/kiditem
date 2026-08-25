import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SourcingCapabilityAdmissionPort } from '../../../application/port/in/capability/sourcing-capability-admission.port';
import { SOURCING_CAPABILITIES } from '../../../domain/capability/sourcing.capabilities';

const DEFAULT_TTL_MS = 2 * 60_000;
const DEFAULT_MAX_ENTRIES = 128;

export interface SourcingScrapeSnapshotAdmissionGuardOptions {
  /** Injected only by the Sourcing composition root or focused tests. */
  now?: () => Date;
  /** Evidence must be short lived because it is not durable work state. */
  ttlMs?: number;
  /** Prevent noisy active Attempts from retaining unbounded process memory. */
  maxEntries?: number;
}

type SnapshotEvidence = Readonly<{
  canonicalSnapshotHash: string;
  contentHash: string;
  expiresAtMs: number;
  admitted: boolean;
  durableAuthorized: boolean;
}>;

/**
 * Process-local evidence gates pre-durable admission. Only an exact,
 * hash-only fingerprint may survive a successful durable authorization until
 * that authorization expires; owner execution never reads this map.
 */
@Injectable()
export class SourcingScrapeSnapshotAdmissionGuard
  implements SourcingCapabilityAdmissionPort
{
  /**
   * This intentionally retains hashes only, never raw browser/provider data
   * or the normalized snapshot itself. The candidate owner independently
   * verifies `contentHash` before its durable write.
   */
  private readonly snapshots = new Map<string, SnapshotEvidence>();
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: SourcingScrapeSnapshotAdmissionGuardOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = positiveInteger(options.ttlMs ?? DEFAULT_TTL_MS, 'sourcing_scrape_snapshot_ttl_invalid');
    this.maxEntries = positiveInteger(options.maxEntries ?? DEFAULT_MAX_ENTRIES, 'sourcing_scrape_snapshot_capacity_invalid');
  }

  recordScrapeSnapshot(input: {
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
    snapshot: unknown;
  }): void {
    this.evictExpired();
    const parsed = scrapeOutput().safeParse({ snapshot: input.snapshot });
    if (!parsed.success) throw new Error('sourcing_scrape_snapshot_invalid');
    const snapshot = parsed.data.snapshot;
    const key = snapshotKey(input, snapshot);
    if (!this.snapshots.has(key) && this.snapshots.size >= this.maxEntries) {
      throw new Error('sourcing_scrape_snapshot_capacity_exhausted');
    }
    const existing = this.snapshots.get(key);
    if (existing?.durableAuthorized) return;
    this.snapshots.set(key, Object.freeze({
      canonicalSnapshotHash: canonicalHash(snapshot),
      contentHash: snapshot.contentHash,
      expiresAtMs: this.now().getTime() + this.ttlMs,
      admitted: existing?.admitted ?? false,
      durableAuthorized: false,
    }));
  }

  async admit(input: {
    capabilityKey: string;
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
    input: unknown;
  }): Promise<void> {
    if (input.capabilityKey !== 'sourcing.ingestCandidate') return;
    this.evictExpired();
    const parsed = ingestInput().safeParse(input.input);
    if (!parsed?.success) throw new Error('sourcing_scrape_snapshot_unbound');
    const snapshot = parsed.data.snapshot;
    const key = snapshotKey(input, snapshot);
    const evidence = this.snapshots.get(key);
    if (
      !evidence ||
      evidence.contentHash !== snapshot.contentHash ||
      evidence.canonicalSnapshotHash !== canonicalHash(snapshot)
    ) {
      throw new Error('sourcing_scrape_snapshot_unbound');
    }
    if (!evidence.admitted) {
      this.snapshots.set(key, Object.freeze({ ...evidence, admitted: true }));
    }
  }

  retainAuthorizedReplay(input: {
    capabilityKey: string;
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
    input: unknown;
    authorizationExpiresAt: Date;
  }): void {
    if (input.capabilityKey !== 'sourcing.ingestCandidate') return;
    const parsed = ingestInput().safeParse(input.input);
    if (!parsed.success) return;
    const snapshot = parsed.data.snapshot;
    const key = snapshotKey(input, snapshot);
    const evidence = this.snapshots.get(key);
    const expiresAtMs = input.authorizationExpiresAt.getTime();
    if (
      !evidence ||
      !evidence.admitted ||
      evidence.contentHash !== snapshot.contentHash ||
      evidence.canonicalSnapshotHash !== canonicalHash(snapshot) ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= this.now().getTime()
    ) {
      return;
    }
    this.snapshots.set(key, Object.freeze({
      ...evidence,
      expiresAtMs,
      durableAuthorized: true,
    }));
  }

  private evictExpired(): void {
    const nowMs = this.now().getTime();
    for (const [key, evidence] of this.snapshots) {
      if (evidence.expiresAtMs <= nowMs) this.snapshots.delete(key);
    }
  }
}

function snapshotKey(
  input: {
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
  },
  snapshot: unknown,
): string {
  return canonicalHash({
    organizationId: input.organizationId,
    initiatingUserId: input.initiatingUserId,
    attemptId: input.attemptId,
    snapshot,
  });
}

function scrapeOutput() {
  const definition = SOURCING_CAPABILITIES.find(
    (candidate) => candidate.key === 'sourcing.scrapeProductUrl',
  );
  if (!definition) throw new Error('sourcing_scrape_snapshot_contract_missing');
  return definition.outputSchema;
}

function ingestInput() {
  const definition = SOURCING_CAPABILITIES.find(
    (candidate) => candidate.key === 'sourcing.ingestCandidate',
  );
  if (!definition) throw new Error('sourcing_scrape_snapshot_contract_missing');
  return definition.inputSchema;
}

function canonicalHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
}

function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}
