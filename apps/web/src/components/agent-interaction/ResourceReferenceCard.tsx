import type { CapabilityResultEnvelope } from '@kiditem/shared/agent-interaction';

type ResourceReference = CapabilityResultEnvelope['resourceRefs'][number];

/**
 * Compact result projection for an allowlisted resource reference. Gateway
 * tool-status events do not create this card; callers must explicitly supply
 * a result envelope reference.
 */
export function ResourceReferenceCard({ reference }: { reference: ResourceReference }) {
  return (
    <article aria-label={`Resource reference ${reference.kind}`} className="rounded-lg border bg-card p-3 text-sm">
      <p className="font-medium">Resource reference</p>
      <dl className="mt-2 grid gap-1">
        <ReferenceDetail label="Kind" value={reference.kind} />
        <ReferenceDetail label="Reference" value={reference.id} />
        <ReferenceDetail label="Version" value={reference.version ?? 'Not versioned'} />
      </dl>
    </article>
  );
}

function ReferenceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
