'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, Shield, X } from 'lucide-react';
import type {
  AgentInstanceSummary,
  AgentInstanceToolPolicySummary,
  AgentToolPolicyApprovalMode,
  AgentToolPolicyDryRunMode,
  AgentToolPolicyEffect,
} from '@kiditem/shared/agent-os';
import { cn } from '@/lib/utils';

type PolicyDraft = Pick<
  AgentInstanceToolPolicySummary,
  'effect' | 'approvalMode' | 'dryRunMode' | 'constraints'
>;

interface AgentOsPolicyOverlayProps {
  open: boolean;
  agents: AgentInstanceSummary[];
  selectedAgentId: string | null;
  policies: AgentInstanceToolPolicySummary[];
  loading: boolean;
  savingToolKey: string | null;
  onClose: () => void;
  onSelectAgent: (agentInstanceId: string) => void;
  onSavePolicy: (
    toolKey: string,
    policy: {
      effect: AgentToolPolicyEffect;
      approvalMode: AgentToolPolicyApprovalMode;
      dryRunMode: AgentToolPolicyDryRunMode;
      constraints: Record<string, unknown>;
    },
  ) => void;
}

const effectOptions: Array<{
  value: AgentToolPolicyEffect;
  label: string;
}> = [
  { value: 'allow', label: 'Allow' },
  { value: 'approval_required', label: 'Approval' },
  { value: 'deny', label: 'Deny' },
];

const approvalModeOptions: Array<{
  value: AgentToolPolicyApprovalMode;
  label: string;
}> = [
  { value: 'none', label: 'None' },
  { value: 'admin', label: 'Admin' },
  { value: 'self', label: 'Self' },
];

const dryRunModeOptions: Array<{
  value: AgentToolPolicyDryRunMode;
  label: string;
}> = [
  { value: 'optional', label: 'Optional' },
  { value: 'required', label: 'Required' },
  { value: 'disabled', label: 'Disabled' },
];

function toDrafts(policies: AgentInstanceToolPolicySummary[]) {
  return Object.fromEntries(
    policies.map((policy) => [
      policy.toolKey,
      {
        effect: policy.effect,
        approvalMode: policy.approvalMode,
        dryRunMode: policy.dryRunMode,
        constraints: policy.constraints,
      },
    ]),
  ) as Record<string, PolicyDraft>;
}

export function AgentOsPolicyOverlay({
  open,
  agents,
  selectedAgentId,
  policies,
  loading,
  savingToolKey,
  onClose,
  onSelectAgent,
  onSavePolicy,
}: AgentOsPolicyOverlayProps) {
  const [drafts, setDrafts] = useState<Record<string, PolicyDraft>>({});

  useEffect(() => {
    if (!open) return;
    setDrafts(toDrafts(policies));
  }, [open, policies]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  if (!open) return null;

  const updateDraft = (
    toolKey: string,
    patch: Partial<PolicyDraft>,
  ) => {
    setDrafts((current) => ({
      ...current,
      [toolKey]: {
        ...(current[toolKey] ?? {
          effect: 'deny',
          approvalMode: 'none',
          dryRunMode: 'optional',
          constraints: {},
        }),
        ...patch,
      },
    }));
  };

  return (
    <section
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm"
      role="region"
      aria-label="Agent Policy"
    >
      <div className="flex h-[min(760px,calc(100vh-40px))] w-[min(980px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1321] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <Shield size={17} className="text-cyan-300" />
            <div>
              <h2 className="text-sm font-bold">Agent Policy</h2>
              <p className="text-xs text-slate-500">
                {selectedAgent?.name ?? 'Agent'} capability permissions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-white"
            aria-label="정책 설정 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden max-md:grid-cols-1">
          <aside className="overflow-y-auto border-r border-white/10 p-3 max-md:max-h-40 max-md:border-b max-md:border-r-0">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelectAgent(agent.id)}
                className={cn(
                  'mb-2 flex w-full flex-col rounded-xl border px-3 py-2.5 text-left transition-colors',
                  selectedAgentId === agent.id
                    ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50'
                    : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]',
                )}
              >
                <span className="text-sm font-semibold">{agent.name}</span>
                <span className="text-xs text-slate-500">{agent.type}</span>
              </button>
            ))}
          </aside>

          <div className="min-h-0 overflow-y-auto p-4">
            {loading ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                정책을 불러오는 중입니다.
              </div>
            ) : policies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                설정 가능한 capability policy가 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {policies.map((policy) => {
                  const draft = drafts[policy.toolKey] ?? {
                    effect: policy.effect,
                    approvalMode: policy.approvalMode,
                    dryRunMode: policy.dryRunMode,
                    constraints: policy.constraints,
                  };
                  return (
                    <article
                      key={policy.toolKey}
                      className="rounded-xl border border-white/[0.08] bg-[#111827] p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="break-all text-sm font-semibold text-white">
                            {policy.toolKey}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            source: {policy.source}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSavePolicy(policy.toolKey, draft)}
                          disabled={savingToolKey === policy.toolKey}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-semibold text-cyan-100 hover:border-cyan-200 disabled:opacity-50"
                        >
                          <Save size={13} />
                          정책 저장
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="space-y-1 text-xs text-slate-500">
                          <span>Effect</span>
                          <select
                            aria-label={`${policy.toolKey} permission effect`}
                            value={draft.effect}
                            onChange={(event) =>
                              updateDraft(policy.toolKey, {
                                effect: event.target.value as AgentToolPolicyEffect,
                              })
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-2 text-sm text-white"
                          >
                            {effectOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-xs text-slate-500">
                          <span>Approval</span>
                          <select
                            aria-label={`${policy.toolKey} approval mode`}
                            value={draft.approvalMode}
                            onChange={(event) =>
                              updateDraft(policy.toolKey, {
                                approvalMode:
                                  event.target.value as AgentToolPolicyApprovalMode,
                              })
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-2 text-sm text-white"
                          >
                            {approvalModeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-xs text-slate-500">
                          <span>Dry run</span>
                          <select
                            aria-label={`${policy.toolKey} dry-run mode`}
                            value={draft.dryRunMode}
                            onChange={(event) =>
                              updateDraft(policy.toolKey, {
                                dryRunMode:
                                  event.target.value as AgentToolPolicyDryRunMode,
                              })
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-2 text-sm text-white"
                          >
                            {dryRunModeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
