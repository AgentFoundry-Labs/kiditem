'use client';

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import {
  Eraser,
  Loader2,
  Paintbrush,
  RefreshCw,
  Replace,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { extractEditedImageUrl } from '../lib/image-edit-result';

interface AIImageEditPanelProps {
  imageUrl: string;
  productId?: string;
  contentGenerationId?: string;
  isBusy: React.MutableRefObject<boolean>;
  onEditComplete: (newImageUrl: string) => void;
  onReplace: () => void;
  onGeneratingChange?: (v: boolean) => void;
  onClose: () => void;
}

type PresetType =
  | 'remove_background'
  | 'remove_text'
  | 'replace_background'
  | 'enhance'
  | 'full_regenerate'
  | 'custom';

interface PresetItem {
  id: PresetType;
  label: string;
  icon: ReactNode;
  needsInput?: boolean;
  inputPlaceholder?: string;
}

const PRESETS: PresetItem[] = [
  { id: 'remove_background', label: '배경 제거', icon: <Eraser size={13} /> },
  { id: 'remove_text', label: '텍스트 제거', icon: <Type size={13} /> },
  {
    id: 'replace_background',
    label: '배경 교체',
    icon: <Paintbrush size={13} />,
    needsInput: true,
    inputPlaceholder: '배경 스타일 (예: 깔끔한 흰색 스튜디오)',
  },
  { id: 'enhance', label: '화질 개선', icon: <Sparkles size={13} /> },
  { id: 'full_regenerate', label: '재생성', icon: <RefreshCw size={13} /> },
];

async function submitImageEdit(params: {
  image_url: string;
  preset: string;
  user_prompt: string;
  productId?: string;
  contentGenerationId?: string;
}): Promise<{ taskId: string }> {
  return apiClient.post<{ taskId: string }>('/api/image-ai/edit', params);
}

// Agent OS: `/api/image-ai/edit` returns `{ taskId }` where taskId is the
// `AgentRunRequest.id` (no AgentRun yet — the run materializes when the
// executor claims the request). We poll `/api/agent-os/requests/:id` and
// pivot to the run via `latestRunId` once status leaves the pre-claim phase.
async function pollTaskResult(taskId: string): Promise<{ image_url: string }> {
  const maxAttempts = 180; // Agent OS has no image-edit business timeout; this is only a UI polling guard.
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    let request: {
      status: string;
      latestRunId: string | null;
      lastErrorCode: string | null;
      lastErrorMessage: string | null;
    };
    try {
      request = await apiClient.get<typeof request>(`/api/agent-os/requests/${taskId}`);
    } catch {
      continue;
    }
    if (request.status === 'pending' || request.status === 'claimed' || request.status === 'requires_approval') {
      continue;
    }
    if (request.status === 'failed' || request.status === 'cancelled' || request.status === 'skipped') {
      throw new Error(request.lastErrorMessage || request.lastErrorCode || '이미지 편집에 실패했습니다');
    }
    if (request.status === 'succeeded' && request.latestRunId) {
      const run = await apiClient.get<{ output?: unknown }>(`/api/agent-os/runs/${request.latestRunId}`);
      const imageUrl = extractEditedImageUrl(run.output ?? null);
      if (!imageUrl) throw new Error('AI 결과 이미지 URL을 찾지 못했습니다');
      return { image_url: imageUrl };
    }
  }
  throw new Error('이미지 편집 결과 확인 시간이 초과되었습니다. 잠시 후 알림에서 결과를 확인해주세요.');
}

export function AIImageEditPanel({
  imageUrl,
  productId,
  contentGenerationId,
  isBusy,
  onEditComplete,
  onReplace,
  onGeneratingChange,
  onClose,
}: AIImageEditPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [presetInput, setPresetInput] = useState<Record<string, string>>({});

  const handlePresetClick = useCallback(
    async (preset: PresetItem) => {
      if (preset.needsInput && !presetInput[preset.id]) return;
      if (isBusy.current) return;

      isBusy.current = true;
      setLoading(true);
      onGeneratingChange?.(true);
      setLoadingPreset(preset.id);
      setError(null);
      try {
        const { taskId } = await submitImageEdit({
          image_url: imageUrl,
          preset: preset.id,
          user_prompt: presetInput[preset.id] || '',
          productId,
          contentGenerationId,
        });
        const result = await pollTaskResult(taskId);
        onEditComplete(result.image_url);
      } catch (err) {
        setError(err instanceof Error ? err.message : '편집에 실패했습니다');
      } finally {
        isBusy.current = false;
        setLoading(false);
        onGeneratingChange?.(false);
        setLoadingPreset(null);
      }
    },
    [imageUrl, productId, contentGenerationId, presetInput, onEditComplete, isBusy, onGeneratingChange],
  );

  const handleCustomSubmit = useCallback(async () => {
    if (!customPrompt.trim()) return;
    if (isBusy.current) return;

    isBusy.current = true;
    setLoading(true);
    onGeneratingChange?.(true);
    setLoadingPreset('custom');
    setError(null);
    try {
      const { taskId } = await submitImageEdit({
        image_url: imageUrl,
        preset: 'custom',
        user_prompt: customPrompt.trim(),
        productId,
        contentGenerationId,
      });
      const result = await pollTaskResult(taskId);
      onEditComplete(result.image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '편집에 실패했습니다');
    } finally {
      isBusy.current = false;
      setLoading(false);
      onGeneratingChange?.(false);
      setLoadingPreset(null);
    }
  }, [imageUrl, productId, contentGenerationId, customPrompt, onEditComplete, isBusy, onGeneratingChange]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <Loader2 size={14} className="animate-spin text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">AI 이미지 처리 중...</span>
          </div>
        )}

        <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
          <img src={imageUrl} alt="편집 대상" className="w-full h-[180px] object-contain" />
        </div>

        <div className="space-y-1.5">
          {PRESETS.map((preset) => (
            <div key={preset.id}>
              <button
                type="button"
                onClick={() => !preset.needsInput && handlePresetClick(preset)}
                disabled={loading}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingPreset === preset.id ? <Loader2 size={13} className="animate-spin" /> : preset.icon}
                {preset.label}
              </button>
              {preset.needsInput && (
                <div className="flex gap-1.5 mt-1.5">
                  <input
                    type="text"
                    value={presetInput[preset.id] || ''}
                    onChange={(e) => setPresetInput((p) => ({ ...p, [preset.id]: e.target.value }))}
                    placeholder={preset.inputPlaceholder}
                    disabled={loading}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    onKeyDown={(e) => e.key === 'Enter' && handlePresetClick(preset)}
                  />
                  <button
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    disabled={loading || !presetInput[preset.id]}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    적용
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={onReplace}
            disabled={loading}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <Replace size={13} />
            이미지 교체
          </button>
        </div>

        <div>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
            placeholder="원하는 편집 내용을 입력하세요..."
            disabled={loading}
            rows={2}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={loading || !customPrompt.trim()}
            className="w-full mt-1.5 py-2 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingPreset === 'custom' ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'AI 편집 적용'}
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg border border-red-100">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
