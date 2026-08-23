import { Injectable } from '@nestjs/common';
import type { SourcingCapabilityAdmissionPort } from '../../../application/port/in/capability/sourcing-capability-admission.port';
import { SOURCING_CAPABILITIES } from '../../../domain/capability/sourcing.capabilities';

/**
 * Process-local evidence is deliberately used only before a durable Agent
 * invocation is created. Owner execution never reads this map.
 */
@Injectable()
export class SourcingScrapeSnapshotAdmissionGuard
  implements SourcingCapabilityAdmissionPort
{
  private readonly snapshots = new Map<string, string>();

  recordScrapeSnapshot(input: {
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
    snapshot: unknown;
  }): void {
    this.snapshots.set(scopeKey(input), canonical(input.snapshot));
  }

  async admit(input: {
    capabilityKey: string;
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
    input: unknown;
  }): Promise<void> {
    if (input.capabilityKey !== 'sourcing.ingestCandidate') return;
    const definition = SOURCING_CAPABILITIES.find(
      (candidate) => candidate.key === input.capabilityKey,
    );
    const parsed = definition?.inputSchema.safeParse(input.input);
    if (!parsed?.success) throw new Error('sourcing_scrape_snapshot_unbound');
    const candidate = parsed.data as { snapshot?: unknown };
    if (this.snapshots.get(scopeKey(input)) !== canonical(candidate.snapshot)) {
      throw new Error('sourcing_scrape_snapshot_unbound');
    }
  }
}

function scopeKey(input: {
  organizationId: string;
  initiatingUserId: string;
  attemptId: string;
}): string {
  return `${input.organizationId}:${input.initiatingUserId}:${input.attemptId}`;
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
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
