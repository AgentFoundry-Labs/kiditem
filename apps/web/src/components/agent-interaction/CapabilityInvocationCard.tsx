'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime } from '@/lib/utils';

interface InvocationReceipt {
  id: string;
  capabilityKey: string;
  actingAgentKey: string;
  canonicalInput: unknown;
  approvalRisk: string;
  approvalStatus: string;
  approvalExpiresAt: string | null;
}

/** Exact Invocation receipt and approval boundary; this component never starts work. */
export function CapabilityInvocationCard({ invocationId }: { invocationId: string }) {
  const queryClient = useQueryClient();
  const receipt = useQuery({
    queryKey: queryKeys.conversations.invocation(invocationId),
    queryFn: () => apiClient.get<InvocationReceipt>(`/api/agent-os/invocations/${encodeURIComponent(invocationId)}`),
  });
  const decision = useMutation({
    mutationFn: (value: 'approved' | 'rejected') => apiClient.post<InvocationReceipt>(
      `/api/agent-os/invocations/${encodeURIComponent(invocationId)}/decision`,
      { decision: value },
    ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.invocation(invocationId) }),
  });

  if (receipt.isLoading) return <p role="status" className="text-sm text-muted-foreground">Loading approval details…</p>;
  if (!receipt.data) return null;
  const approvalStatus = decision.data?.approvalStatus ?? receipt.data.approvalStatus;
  const pending = approvalStatus === 'pending';

  return (
    <section aria-label={`Invocation ${receipt.data.capabilityKey}`} className="rounded-lg border border-amber-300/70 bg-amber-50/50 p-3 text-sm">
      <h2 className="font-semibold">Capability approval</h2>
      <dl className="mt-2 grid gap-1 text-sm">
        <ReceiptDetail label="Capability" value={receipt.data.capabilityKey} />
        <ReceiptDetail label="Acting Agent" value={receipt.data.actingAgentKey} />
        <ReceiptDetail label="Risk" value={receipt.data.approvalRisk} />
        <ReceiptDetail label="Expiry" value={formatExpiry(receipt.data.approvalExpiresAt)} />
      </dl>
      <pre className="mt-2 max-h-32 overflow-auto rounded bg-background/80 p-2 text-xs whitespace-pre-wrap">
        {safeInputSummary(receipt.data.canonicalInput)}
      </pre>
      <p className="mt-2 text-sm text-muted-foreground">{approvalStatusSummary(approvalStatus)}</p>
      {pending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={decision.isPending}
            onClick={() => decision.mutate('approved')}
            className="inline-flex min-h-10 items-center gap-1 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11"
          >
            <Check aria-hidden="true" size={16} /> Approve
          </button>
          <button
            type="button"
            disabled={decision.isPending}
            onClick={() => decision.mutate('rejected')}
            className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11"
          >
            <X aria-hidden="true" size={16} /> Reject
          </button>
        </div>
      ) : null}
      {decision.data?.approvalStatus === 'approved' ? <p role="status" className="mt-3 text-emerald-700">The provider may retry the same request.</p> : null}
      {decision.data?.approvalStatus === 'rejected' ? <p role="status" className="mt-3 text-muted-foreground">The request was rejected.</p> : null}
      {decision.isError ? <p role="alert" className="mt-3 text-destructive">The approval decision could not be saved.</p> : null}
    </section>
  );
}

function ReceiptDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );
}

function approvalStatusSummary(status: string): string {
  switch (status) {
    case 'pending': return 'Awaiting your exact-input approval.';
    case 'approved': return 'Approved. The provider can retry this exact request.';
    case 'rejected': return 'Rejected. No work was started by this decision.';
    case 'expired': return 'Approval expired before a decision was recorded.';
    case 'not_required': return 'No approval is currently required.';
    default: return 'Approval status is ambiguous. Review the Invocation receipt.';
  }
}

function formatExpiry(expiry: string | null): string {
  if (!expiry) return 'No expiry recorded';
  return Number.isNaN(new Date(expiry).getTime()) ? 'Expiry unavailable' : formatDateTime(expiry);
}

function safeInputSummary(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 2_000 ? `${serialized.slice(0, 2_000)}…` : serialized;
  } catch {
    return '[Unavailable input summary]';
  }
}
