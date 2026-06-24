'use client';

import { Boxes, CheckCircle2, Clock3, Route, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentOsGraph } from '../lib/agent-os-types';
import { ApprovalCard } from './ApprovalCard';

function statusTone(status: string): string {
  if (status === 'succeeded') return 'text-emerald-200 bg-emerald-400/10';
  if (status === 'failed') return 'text-red-200 bg-red-400/10';
  if (status === 'running') return 'text-cyan-200 bg-cyan-400/10';
  if (status === 'waiting_approval' || status === 'requires_approval') {
    return 'text-amber-200 bg-amber-400/10';
  }
  return 'text-slate-300 bg-white/5';
}

export function RunInspector({
  graph,
  approvalPendingId,
  onResolveApproval,
}: {
  graph: AgentOsGraph | null;
  approvalPendingId?: string | null;
  onResolveApproval?: (
    approvalRequestId: string,
    status: 'approved' | 'rejected',
  ) => void;
}) {
  const approvals =
    graph?.toolInvocations.filter((tool) => tool.status === 'waiting_approval') ??
    [];

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#0c1220]">
      <div className="flex h-16 items-center border-b border-white/10 px-4">
        <div>
          <h2 className="text-sm font-bold text-white">Run Inspector</h2>
          <p className="mt-0.5 text-xs text-slate-400">Task graph and artifacts</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!graph ? (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">
            대화를 선택하세요.
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Route className="h-3.5 w-3.5" aria-hidden="true" />
                Tasks
              </div>
              <div className="space-y-2">
                {graph.nodes.map((node) => (
                  <div
                    key={node.id}
                    className="rounded-lg border border-white/10 bg-[#101827] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {node.label}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {node.agentType ?? node.kind}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium',
                          statusTone(node.status),
                        )}
                      >
                        {node.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {approvals.length > 0 ? (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Approvals
                </div>
                {approvals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    invocation={approval}
                    pending={
                      Boolean(approval.approvalRequestId) &&
                      approvalPendingId === approval.approvalRequestId
                    }
                    onResolve={onResolveApproval}
                  />
                ))}
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                Tools
              </div>
              <div className="space-y-2">
                {graph.toolInvocations.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                    호출된 Tool이 없습니다.
                  </div>
                ) : (
                  graph.toolInvocations.map((tool) => (
                    <div
                      key={tool.id}
                      className="rounded-lg border border-white/10 bg-[#101827] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate text-xs font-medium text-slate-200">
                          {tool.capabilityKey}
                        </div>
                        <span className={cn('rounded-md px-2 py-0.5 text-[11px]', statusTone(tool.status))}>
                          {tool.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
                Artifacts
              </div>
              <div className="space-y-2">
                {graph.artifacts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                    생성된 결과가 없습니다.
                  </div>
                ) : (
                  graph.artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="rounded-lg border border-white/10 bg-[#101827] p-3"
                    >
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-100">
                            {artifact.title}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock3 className="h-3 w-3" aria-hidden="true" />
                            {artifact.artifactType}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
