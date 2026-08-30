import { Injectable } from '@nestjs/common';
import type { SourcingCapabilityAdmissionPort } from '../../../application/port/in/capability/sourcing-capability-admission.port';
import { SOURCING_CAPABILITIES } from '../../../domain/capability/sourcing.capabilities';
import {
  canonicalizeOwnerInput,
  canonicalOwnerInputHash,
} from '../../../../common/owner-idempotency-key';

const DEFAULT_TTL_MS = 2 * 60_000;
const DEFAULT_MAX_ENTRIES = 128;

export interface SourcingScrapeSnapshotAdmissionGuardOptions {
  now?: () => Date;
  ttlMs?: number;
  maxEntries?: number;
}

type SnapshotEvidence = Readonly<{
  canonicalInput: unknown;
  inputHash: string;
  contentHash: string;
  expiresAtMs: number;
}>;

/**
 * Process-memory-only same-turn scrape admission. It stores no raw browser,
 * provider, or unbounded payload, and a process restart clears every receipt.
 */
@Injectable()
export class SourcingScrapeSnapshotAdmissionGuard
  implements SourcingCapabilityAdmissionPort
{
  private readonly snapshots = new Map<string, SnapshotEvidence>();
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: SourcingScrapeSnapshotAdmissionGuardOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = positiveInteger(
      options.ttlMs ?? DEFAULT_TTL_MS,
      'sourcing_scrape_snapshot_ttl_invalid',
    );
    this.maxEntries = positiveInteger(
      options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      'sourcing_scrape_snapshot_capacity_invalid',
    );
  }

  recordScrapeSnapshot(input: {
    organizationId: string;
    initiatingUserId: string;
    executionId: string;
    snapshot: unknown;
  }): void {
    this.evictExpired();
    const parsed = scrapeOutput().safeParse({ snapshot: input.snapshot });
    if (!parsed.success) throw new Error('sourcing_scrape_snapshot_invalid');
    const canonicalInput = canonicalizeOwnerInput(
      ingestInput().parse({ snapshot: parsed.data.snapshot }),
    );
    const key = executionKey(input);
    if (!this.snapshots.has(key) && this.snapshots.size >= this.maxEntries) {
      throw new Error('sourcing_scrape_snapshot_capacity_exhausted');
    }
    this.snapshots.set(
      key,
      Object.freeze({
        canonicalInput,
        inputHash: canonicalOwnerInputHash(canonicalInput),
        contentHash: parsed.data.snapshot.contentHash,
        expiresAtMs: this.now().getTime() + this.ttlMs,
      }),
    );
  }

  async admit(input: {
    capabilityKey: string;
    organizationId: string;
    initiatingUserId: string;
    executionId: string;
    input: unknown;
  }): Promise<{ canonicalInput: unknown }> {
    if (input.capabilityKey !== 'sourcing.ingestCandidate') {
      return { canonicalInput: canonicalizeOwnerInput(input.input) };
    }
    this.evictExpired();
    const parsed = ingestInput().safeParse(input.input);
    if (!parsed.success) throw new Error('sourcing_scrape_snapshot_unbound');
    const canonicalInput = canonicalizeOwnerInput(parsed.data);
    const evidence = this.snapshots.get(executionKey(input));
    if (
      !evidence ||
      evidence.contentHash !== parsed.data.snapshot.contentHash ||
      evidence.inputHash !== canonicalOwnerInputHash(canonicalInput)
    ) {
      throw new Error('sourcing_scrape_snapshot_unbound');
    }
    return { canonicalInput: evidence.canonicalInput };
  }

  revokeExecution(input: {
    organizationId: string;
    initiatingUserId: string;
    executionId: string;
  }): void {
    this.snapshots.delete(executionKey(input));
  }

  private evictExpired(): void {
    const nowMs = this.now().getTime();
    for (const [key, evidence] of this.snapshots) {
      if (evidence.expiresAtMs <= nowMs) this.snapshots.delete(key);
    }
  }
}

function executionKey(input: {
  organizationId: string;
  initiatingUserId: string;
  executionId: string;
}): string {
  return `${input.organizationId}:${input.initiatingUserId}:${input.executionId}`;
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

function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}
