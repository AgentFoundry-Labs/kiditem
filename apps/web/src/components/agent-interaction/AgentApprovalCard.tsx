'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentApprovalCard as AgentApproval } from '@kiditem/shared/agent-interaction';

export function AgentApprovalCard({
  approval,
  onDecision,
}: {
  approval: AgentApproval;
  onDecision: (decision: 'approved' | 'rejected') => void;
}) {
  const expired = useApprovalExpiry(approval.expiresAt);
  const decisionSent = useRef<string | null>(null);
  const [submittedApprovalId, setSubmittedApprovalId] = useState<string | null>(null);
  const disabled = expired || submittedApprovalId === approval.approvalId;
  const submitDecision = (decision: 'approved' | 'rejected') => {
    if (disabled || decisionSent.current === approval.approvalId) return;
    decisionSent.current = approval.approvalId;
    setSubmittedApprovalId(approval.approvalId);
    onDecision(decision);
  };

  return (
    <section
      data-testid={`agent-approval-${approval.approvalId}`}
      aria-label="Agent 승인 요청"
      className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950"
    >
      <div>
        <p className="text-sm font-semibold">승인이 필요합니다</p>
        <p className="mt-1 text-sm">{approval.summary}</p>
      </div>
      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2"><dt className="font-medium">기능</dt><dd>{approval.capabilityKey}</dd></div>
        <div className="flex gap-2"><dt className="font-medium">만료</dt><dd>{formatExpiry(approval.expiresAt)}</dd></div>
      </dl>
      {approval.resourceVersions.length > 0 ? (
        <ul aria-label="고정된 리소스 버전" className="space-y-1 text-xs text-amber-900">
          {approval.resourceVersions.map((resource) => (
            <li key={`${resource.resourceType}:${resource.resourceId}:${resource.version}`}>
              {resource.resourceType} · {resource.resourceId} · v{resource.version}
            </li>
          ))}
        </ul>
      ) : null}
      {expired ? (
        <p role="status" className="text-sm font-medium">승인 요청이 만료되었습니다.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => submitDecision('approved')}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          승인
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => submitDecision('rejected')}
          className="rounded-md border border-amber-500 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          거절
        </button>
      </div>
    </section>
  );
}

function useApprovalExpiry(expiresAt: string): boolean {
  const expiresAtMs = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const delay = Math.min(
      2_147_483_647,
      Math.max(0, expiresAtMs - now) + 1,
    );
    const timeout = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timeout);
  }, [expiresAtMs, now]);

  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now;
}

function formatExpiry(expiresAt: string): string {
  const value = new Date(expiresAt);
  return Number.isFinite(value.getTime()) ? value.toLocaleString('ko-KR') : '알 수 없음';
}
