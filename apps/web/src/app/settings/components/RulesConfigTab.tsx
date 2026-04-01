'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import PageSkeleton from '@/components/ui/PageSkeleton';

interface BusinessRule {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  severity: string;
  field: string;
  operator: string;
  threshold: Record<string, number>;
  messageTemplate: string;
  actionType: string | null;
  autoExecute: boolean;
  active: boolean;
  sortOrder: number;
}

const RULE_CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'profitability', label: '수익성' },
  { key: 'advertising', label: '광고' },
  { key: 'inventory', label: '재고' },
  { key: 'feedback', label: '피드백' },
  { key: 'order', label: '주문' },
];

const SEVERITY_BADGE: Record<string, { label: string; cls: string }> = {
  critical: { label: '위험', cls: 'bg-red-100 text-red-700' },
  warning: { label: '주의', cls: 'bg-amber-100 text-amber-700' },
  info: { label: '정보', cls: 'bg-blue-100 text-blue-700' },
};

interface RuleChange {
  active?: boolean;
  autoExecute?: boolean;
  threshold?: Record<string, number>;
}

interface ScheduleOption {
  key: string;
  label: string;
  crons: string[];
}

export default function RulesConfigTab() {
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [changes, setChanges] = useState<Record<string, RuleChange>>({});
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const { data: rules = [], isLoading: loading } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const data: unknown = await apiClient.get('/api/rules');
      return Array.isArray(data) ? data as BusinessRule[] : [];
    },
  });

  const { data: scheduleData } = useQuery({
    queryKey: ['rules', 'schedule'],
    queryFn: () => apiClient.get<{ schedule: string; options: ScheduleOption[] }>('/api/rules/schedule'),
  });
  const schedule = scheduleData?.schedule ?? 'twice_daily';
  const scheduleOptions = scheduleData?.options ?? [];

  const updateScheduleMutation = useMutation({
    mutationFn: (newSchedule: string) => apiClient.patch('/api/rules/schedule', { schedule: newSchedule }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules', 'schedule'] }),
  });
  const handleScheduleChange = (newSchedule: string) => updateScheduleMutation.mutate(newSchedule);
  const scheduleUpdating = updateScheduleMutation.isPending;

  const { data: suggestionsData, isFetching: suggestionsLoading, refetch: loadSuggestions } = useQuery({
    queryKey: ['rules', 'suggestions'],
    queryFn: async () => {
      const data = await apiClient.get<{ suggestions: { currentThreshold: number | null; suggestedThreshold: number; ruleId: string }[] }>('/api/rules/suggest-thresholds');
      const map: Record<string, { currentThreshold: number | null; suggestedThreshold: number; ruleId: string }> = {};
      for (const s of data.suggestions ?? []) {
        map[s.ruleId] = { currentThreshold: s.currentThreshold, suggestedThreshold: s.suggestedThreshold, ruleId: s.ruleId };
      }
      return map;
    },
    enabled: false,
  });
  const suggestions = suggestionsData ?? {};
  const handleLoadSuggestions = () => { loadSuggestions(); };

  const handleApplySuggestion = (ruleId: string, suggested: number) => {
    setChanges((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], threshold: { value: suggested } },
    }));
  };

  const filteredRules = categoryFilter === 'all'
    ? rules
    : rules.filter((r) => r.category === categoryFilter);

  const isRuleActive = (rule: BusinessRule): boolean => {
    const c = changes[rule.id];
    return c?.active !== undefined ? c.active : rule.active;
  };

  const isRuleAutoExecute = (rule: BusinessRule): boolean => {
    const c = changes[rule.id];
    return c?.autoExecute !== undefined ? c.autoExecute : rule.autoExecute;
  };

  const getRuleThreshold = (rule: BusinessRule): Record<string, number> => {
    const c = changes[rule.id];
    return c?.threshold ?? rule.threshold;
  };

  const updateChange = (ruleId: string, patch: RuleChange) => {
    setChanges((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], ...patch },
    }));
  };

  const updateThreshold = (ruleId: string, key: string, val: number) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    const current = getRuleThreshold(rule);
    updateChange(ruleId, { threshold: { ...current, [key]: val } });
  };

  const hasChanges = Object.keys(changes).length > 0;

  const saveRulesMutation = useMutation({
    mutationFn: async (pendingChanges: Record<string, RuleChange>) => {
      for (const [id, patch] of Object.entries(pendingChanges)) {
        await apiClient.patch(`/api/rules/${id}`, patch);
      }
      await apiClient.post('/api/rules/reload');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules'] });
      setChanges({});
      setSaveMsg({ text: '저장 완료', type: 'success' });
      setTimeout(() => setSaveMsg(null), 3000);
    },
    onError: (err) => {
      setSaveMsg({ text: isApiError(err) ? err.detail : '저장 실패', type: 'error' });
    },
  });
  const saving = saveRulesMutation.isPending;

  const handleSave = () => {
    setSaveMsg(null);
    saveRulesMutation.mutate(changes);
  };

  if (loading) {
    return <PageSkeleton variant="cards" />;
  }

  return (
    <div className="space-y-4">
      {scheduleOptions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">자동 평가 스케줄</h4>
              <p className="text-xs text-gray-500 mt-0.5">설정된 간격으로 전체 상품을 자동 평가합니다</p>
            </div>
            <select
              value={schedule}
              onChange={(e) => handleScheduleChange(e.target.value)}
              disabled={scheduleUpdating}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 disabled:opacity-50"
            >
              {scheduleOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {RULE_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                categoryFilter === cat.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className={cn(
              'text-xs font-medium',
              saveMsg.type === 'success' ? 'text-green-600' : 'text-red-600'
            )}>
              {saveMsg.text}
            </span>
          )}
          <button
            onClick={handleLoadSuggestions}
            disabled={suggestionsLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {suggestionsLoading ? '분석 중...' : '추천 임계값'}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {filteredRules.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          <Shield className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">규칙이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRules.map((rule) => {
            const active = isRuleActive(rule);
            const autoExec = isRuleAutoExecute(rule);
            const threshold = getRuleThreshold(rule);
            const sev = SEVERITY_BADGE[rule.severity] || SEVERITY_BADGE.info;

            return (
              <div
                key={rule.id}
                className={cn(
                  'bg-white rounded-lg border border-gray-200 p-4 transition-opacity',
                  !active && 'opacity-50'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', sev.cls)}>
                        {sev.label}
                      </span>
                      <h4 className="text-sm font-semibold text-gray-900">{rule.displayName}</h4>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-gray-500 mb-2">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-400">
                        필드: <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">{rule.field}</code>
                      </span>
                      <span className="text-xs text-gray-400">조건: {rule.operator}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">임계값:</span>
                        {threshold.value !== undefined ? (
                          <input
                            type="number"
                            value={threshold.value}
                            onChange={(e) => updateThreshold(rule.id, 'value', Number(e.target.value))}
                            className="w-16 text-center border-b border-gray-300 text-xs py-0.5 bg-transparent focus:border-blue-500 focus:outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={threshold.min ?? 0}
                              onChange={(e) => updateThreshold(rule.id, 'min', Number(e.target.value))}
                              className="w-14 text-center border-b border-gray-300 text-xs py-0.5 bg-transparent focus:border-blue-500 focus:outline-none"
                            />
                            <span className="text-xs text-gray-400">~</span>
                            <input
                              type="number"
                              value={threshold.max ?? 0}
                              onChange={(e) => updateThreshold(rule.id, 'max', Number(e.target.value))}
                              className="w-14 text-center border-b border-gray-300 text-xs py-0.5 bg-transparent focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        )}
                        {suggestions[rule.id] && suggestions[rule.id].suggestedThreshold !== suggestions[rule.id].currentThreshold && (
                          <button
                            onClick={() => handleApplySuggestion(rule.id, suggestions[rule.id].suggestedThreshold)}
                            className="px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                          >
                            추천: {suggestions[rule.id].suggestedThreshold}
                          </button>
                        )}
                      </div>
                    </div>
                    {rule.actionType && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400">액션: {rule.actionType}</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-xs text-gray-500">자동실행</span>
                          <button
                            type="button"
                            onClick={() => updateChange(rule.id, { autoExecute: !autoExec })}
                            className={cn(
                              'relative w-9 h-5 rounded-full transition-colors',
                              autoExec ? 'bg-blue-600' : 'bg-gray-300'
                            )}
                          >
                            <span className={cn(
                              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                              autoExec && 'translate-x-4'
                            )} />
                          </button>
                        </label>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateChange(rule.id, { active: !active })}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors shrink-0',
                      active ? 'bg-green-500' : 'bg-gray-300'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                      active && 'translate-x-5'
                    )} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
