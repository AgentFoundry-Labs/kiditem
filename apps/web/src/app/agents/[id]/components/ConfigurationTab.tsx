'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { ADAPTER_LABELS, ROLE_LABELS } from '../../lib/agent-types';
import { useUpdateAgent } from '../../hooks/useAgents';
import type { Agent } from '../../lib/agent-types';

type ConfigForm = {
  name: string;
  title: string;
  description: string;
  timeoutSeconds: number;
  schedule: string;
  monthlyTokenBudget: number;
};

function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</h4>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function ConfigurationTab({
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

  const originalForm: ConfigForm = {
    name: agent.name,
    title: agent.title ?? '',
    description: agent.description ?? '',
    timeoutSeconds: agent.timeoutSeconds,
    schedule: agent.schedule ?? '',
    monthlyTokenBudget: agent.monthlyTokenBudget,
  };

  const [form, setForm] = useState<ConfigForm>(originalForm);

  useEffect(() => {
    setForm({
      name: agent.name,
      title: agent.title ?? '',
      description: agent.description ?? '',
      timeoutSeconds: agent.timeoutSeconds,
      schedule: agent.schedule ?? '',
      monthlyTokenBudget: agent.monthlyTokenBudget,
    });
  }, [agent]);

  const isDirty =
    form.name !== agent.name ||
    form.title !== (agent.title ?? '') ||
    form.description !== (agent.description ?? '') ||
    form.timeoutSeconds !== agent.timeoutSeconds ||
    form.schedule !== (agent.schedule ?? '') ||
    form.monthlyTokenBudget !== agent.monthlyTokenBudget;

  useEffect(() => {
    onDirtyChange(isDirty);

    if (isDirty) {
      onSaveAction(async () => {
        onSavingChange(true);
        try {
          await updateAgent.mutateAsync({
            id: agent.id,
            data: {
              name: form.name,
              title: form.title || null,
              description: form.description || null,
              timeoutSeconds: form.timeoutSeconds,
              schedule: form.schedule || null,
              monthlyTokenBudget: form.monthlyTokenBudget,
            },
          });
          onSaved();
          onDirtyChange(false);
        } catch (err) {
          toast.error(isApiError(err) ? err.detail : '설정 저장에 실패했습니다.');
        } finally {
          onSavingChange(false);
        }
      });
      onCancelAction(() => {
        setForm(originalForm);
        onDirtyChange(false);
      });
    }
  }, [isDirty, form, agent.id]);

  const field = (key: keyof ConfigForm) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = e.target.value;
      if (key === 'timeoutSeconds' || key === 'monthlyTokenBudget') {
        setForm(f => ({ ...f, [key]: Number(raw) || 0 }));
      } else {
        setForm(f => ({ ...f, [key]: raw }));
      }
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Identity */}
      <ConfigSection title="Identity">
        <div className="space-y-4">
          <FormField label="이름">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors"
              {...field('name')}
            />
          </FormField>
          <FormField label="직함">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors"
              placeholder="e.g. Senior Analyst"
              {...field('title')}
            />
          </FormField>
          <FormField label="설명">
            <textarea
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors resize-none"
              rows={3}
              {...field('description')}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="역할">
              <div className="px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-600">
                {ROLE_LABELS[agent.role] ?? agent.role}
              </div>
            </FormField>
            <FormField label="타입">
              <div className="px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-600 font-mono">
                {agent.type}
              </div>
            </FormField>
          </div>
        </div>
      </ConfigSection>

      {/* Adapter */}
      <ConfigSection title="Adapter">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="어댑터 타입">
            <div className="px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-600 font-mono">
              {ADAPTER_LABELS[agent.adapterType] ?? agent.adapterType}
            </div>
          </FormField>
          <FormField label="모델">
            <div className="px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-600 font-mono truncate">
              {(agent.adapterConfig?.model as string) ?? '—'}
            </div>
          </FormField>
        </div>
        <div className="mt-4">
          <span className="text-xs text-slate-500 block mb-1">어댑터 설정 (JSON)</span>
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto text-slate-700">
            {JSON.stringify(agent.adapterConfig, null, 2)}
          </pre>
        </div>
      </ConfigSection>

      {/* Runtime */}
      <ConfigSection title="Runtime">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="타임아웃 (초)">
            <input
              type="number"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors"
              min={0}
              {...field('timeoutSeconds')}
            />
          </FormField>
          <FormField label="스케줄 (cron)">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors font-mono"
              placeholder="0 * * * *"
              {...field('schedule')}
            />
          </FormField>
        </div>
      </ConfigSection>

      {/* Permissions */}
      <ConfigSection title="Permissions">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="권한 모드">
            <div className="px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-600 font-mono">
              {agent.permissionMode || '—'}
            </div>
          </FormField>
          <FormField label="허용 도구">
            <div className="px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-600 truncate">
              {agent.allowedTools || '—'}
            </div>
          </FormField>
        </div>
      </ConfigSection>
    </div>
  );
}
