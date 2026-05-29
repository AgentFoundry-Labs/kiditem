'use client';

import { ShieldAlert } from 'lucide-react';
import type { AgentOsToolInvocation } from '../lib/agent-os-types';

export function ApprovalCard({ invocation }: { invocation: AgentOsToolInvocation }) {
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
        </div>
      </div>
    </article>
  );
}
