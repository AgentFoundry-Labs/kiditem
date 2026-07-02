'use client';

import { Check, ShieldAlert, X } from 'lucide-react';
import type { AgentOsToolInvocation } from '../lib/agent-os-types';

export function ApprovalCard({
  invocation,
  pending,
  onResolve,
}: {
  invocation: AgentOsToolInvocation;
  pending?: boolean;
  onResolve?: (
    approvalRequestId: string,
    status: 'approved' | 'rejected',
  ) => void;
}) {
  const approvalRequestId = invocation.approvalRequestId;

  return (
    <article className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-300/15 text-amber-200">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-amber-100">승인 대기</h3>
          <p className="mt-1 text-xs leading-5 text-amber-100/80">
            {invocation.capabilityKey}
          </p>
          {approvalRequestId ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onResolve?.(approvalRequestId, 'approved')}
                disabled={pending}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-300/40 px-2.5 text-xs font-semibold text-emerald-100 hover:border-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                승인
              </button>
              <button
                type="button"
                onClick={() => onResolve?.(approvalRequestId, 'rejected')}
                disabled={pending}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-300/40 px-2.5 text-xs font-semibold text-red-100 hover:border-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                거절
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
