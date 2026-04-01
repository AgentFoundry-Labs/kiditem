'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentApi } from '@/lib/agent-api';
import { isApiError } from '@/lib/api-error';
import { formatTokens, formatCost } from '@/lib/agent-utils';
import type { Agent, AgentRuntimeState } from '@/lib/agent-types';

export function BudgetTab({
  agent,
  runtimeState,
  onSaved,
}: {
  agent: Agent;
  runtimeState: AgentRuntimeState | null;
  onSaved: () => void;
}) {
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const observedCents = runtimeState?.totalCostCents ?? 0;
  const budgetCents = agent.monthlyTokenBudget; // stored as tokens but we display as tokens
  const tokensUsed = (runtimeState?.totalInputTokens ?? 0) + (runtimeState?.totalOutputTokens ?? 0);
  const tokensTotal = agent.monthlyTokenBudget;
  const progressPct = tokensTotal > 0 ? Math.min((tokensUsed / tokensTotal) * 100, 100) : 0;
  const remaining = Math.max(tokensTotal - tokensUsed, 0);

  const isHealthy = progressPct < 80;

  const handleSetBudget = async () => {
    const val = Number(budgetInput);
    if (!Number.isFinite(val) || val < 0) return;
    setSaving(true);
    try {
      await agentApi.update(agent.id, { monthlyTokenBudget: Math.round(val) });
      await onSaved();
      setBudgetInput('');
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      alert(isApiError(err) ? err.detail : '예산 설정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">AGENT</p>
          <h2 className="text-xl font-semibold text-gray-900 mt-1">{agent.name}</h2>
          <p className="text-sm text-gray-500 mt-1">월간 UTC 예산</p>
        </div>
        <div className={cn(
          'inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-medium',
          isHealthy ? 'text-green-600' : 'text-amber-600',
        )}>
          {isHealthy ? <Wallet className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {isHealthy ? 'HEALTHY' : 'WARNING'}
        </div>
      </div>

      {/* Observed / Budget grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Observed</p>
          <p className="text-xl font-semibold text-gray-900 mt-2 tabular-nums">{formatCost(observedCents)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {budgetCents > 0 ? `${progressPct.toFixed(1)}% 사용` : '한도 없음'}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Budget (tokens)</p>
          <p className="text-xl font-semibold text-gray-900 mt-2 tabular-nums">
            {budgetCents > 0 ? formatTokens(budgetCents) : 'Disabled'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            월간 토큰 예산
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>남은 예산</span>
          <span>{tokensTotal > 0 ? formatTokens(remaining) : '무제한'}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              progressPct >= 90 ? 'bg-red-500' : progressPct >= 75 ? 'bg-amber-400' : 'bg-green-500',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Token stats */}
      {runtimeState && (
        <div className="border border-gray-200 rounded-lg p-4 grid grid-cols-3 gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">입력 토큰</span>
            <span className="text-base font-semibold tabular-nums text-gray-900">{formatTokens(runtimeState.totalInputTokens)}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">출력 토큰</span>
            <span className="text-base font-semibold tabular-nums text-gray-900">{formatTokens(runtimeState.totalOutputTokens)}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-gray-400 block mb-1">총 비용</span>
            <span className="text-base font-semibold tabular-nums text-green-700">{formatCost(runtimeState.totalCostCents)}</span>
          </div>
        </div>
      )}

      {/* Set budget */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <label className="text-[11px] uppercase tracking-[0.18em] text-gray-400 block">
          월간 토큰 예산 설정
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
            placeholder="토큰 수 (예: 1000000)"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            min={0}
          />
          <button
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            onClick={handleSetBudget}
            disabled={saving || !budgetInput}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            예산 설정
          </button>
        </div>
        {savedMsg && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> 저장되었습니다.
          </p>
        )}
        {agent.budgetResetAt && (
          <p className="text-xs text-gray-400">
            다음 리셋: {new Date(agent.budgetResetAt).toLocaleDateString('ko-KR')}
          </p>
        )}
      </div>
    </div>
  );
}
