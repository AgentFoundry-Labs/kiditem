'use client';

import { useState, useEffect } from 'react';
import { isApiError } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';
import type { Agent } from '../../lib/agent-types';
import { useUpdateAgent } from '../../hooks/useAgents';

export function InstructionsTab({
  agent,
  onDirtyChange,
  onSaveAction,
  onCancelAction,
  onSavingChange,
  onSaved,
}: {
  agent: Agent;
  onDirtyChange: (dirty: boolean) => void;
  onSaveAction: (fn: () => void) => void;
  onCancelAction: (fn: () => void) => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
}) {
  const updateAgent = useUpdateAgent();
  const [draft, setDraft] = useState(agent.promptTemplate ?? '');
  const original = agent.promptTemplate ?? '';

  useEffect(() => {
    setDraft(agent.promptTemplate ?? '');
  }, [agent.promptTemplate]);

  useEffect(() => {
    const dirty = draft !== original;
    onDirtyChange(dirty);

    if (dirty) {
      onSaveAction(async () => {
        onSavingChange(true);
        try {
          await updateAgent.mutateAsync({ id: agent.id, data: { promptTemplate: draft } });
          onSaved();
          onDirtyChange(false);
        } catch (err) {
          toast.error(isApiError(err) ? err.detail : '인스트럭션 저장에 실패했습니다.');
        } finally {
          onSavingChange(false);
        }
      });
      onCancelAction(() => {
        setDraft(original);
        onDirtyChange(false);
      });
    }
  }, [draft, original, agent.id, onDirtyChange, onSaveAction, onCancelAction, onSavingChange, onSaved]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-900">프롬프트 템플릿</h3>
          <p className="text-xs text-slate-500 mt-0.5">에이전트의 시스템 프롬프트입니다. 편집 후 저장 버튼을 누르세요.</p>
        </div>
      </div>
      <textarea
        className="w-full h-[600px] font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-900 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        placeholder="프롬프트 템플릿을 입력하세요..."
      />
      <p className="text-xs text-slate-400">
        {formatNumber(draft.length)}자 · 대략 {formatNumber(Math.round(draft.length / 4))} 토큰
      </p>
    </div>
  );
}
