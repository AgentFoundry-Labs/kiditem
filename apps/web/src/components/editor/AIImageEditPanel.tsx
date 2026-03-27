'use client';

import { API_BASE } from '@/lib/api';
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
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

interface AIImageEditPanelProps {
  imageUrl: string;
  isBusy: React.MutableRefObject<boolean>;
  onEditComplete: (newImageUrl: string) => void;
  onReplace: () => void;
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
}): Promise<{ taskId: string }> {
  const res = await fetch(`${API_BASE}/api/image-ai/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pollTaskResult(taskId: string): Promise<{ image_url: string }> {
  const maxAttempts = 60; // 60 * 2s = 120s max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`${API_BASE}/api/agent-tasks/${taskId}`);
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const task = await res.json();
    if (task.status === 'completed') {
      const output = typeof task.output === 'string' ? JSON.parse(task.output) : task.output;
      if (!output?.image_url) throw new Error('결과 이미지가 없습니다');
      return { image_url: output.image_url };
    }
    if (task.status === 'failed') {
      throw new Error(task.error || '이미지 편집에 실패했습니다');
    }
  }
  throw new Error('시간 초과: 이미지 편집이 너무 오래 걸립니다');
}

export function AIImageEditPanel({ imageUrl, isBusy, onEditComplete, onReplace, onClose }: AIImageEditPanelProps) {
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
      setLoadingPreset(preset.id);
      setError(null);
      try {
        const { taskId } = await submitImageEdit({
          image_url: imageUrl,
          preset: preset.id,
          user_prompt: presetInput[preset.id] || '',
        });
        const result = await pollTaskResult(taskId);
        onEditComplete(result.image_url);
      } catch (err) {
        setError(err instanceof Error ? err.message : '편집에 실패했습니다');
      } finally {
        isBusy.current = false;
        setLoading(false);
        setLoadingPreset(null);
      }
    },
    [imageUrl, presetInput, onEditComplete, isBusy],
  );

  const handleCustomSubmit = useCallback(async () => {
    if (!customPrompt.trim()) return;
    if (isBusy.current) return;

    isBusy.current = true;
    setLoading(true);
    setLoadingPreset('custom');
    setError(null);
    try {
      const { taskId } = await submitImageEdit({
        image_url: imageUrl,
        preset: 'custom',
        user_prompt: customPrompt.trim(),
      });
      const result = await pollTaskResult(taskId);
      onEditComplete(result.image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '편집에 실패했습니다');
    } finally {
      isBusy.current = false;
      setLoading(false);
      setLoadingPreset(null);
    }
  }, [imageUrl, customPrompt, onEditComplete, isBusy]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <Loader2 size={14} className="animate-spin text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">AI 이미지 처리 중... (최대 40초)</span>
          </div>
        )}

        <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
          <img src={imageUrl} alt="편집 대상" className="w-full h-[180px] object-contain" />
        </div>

        <div className="space-y-1.5">
          {PRESETS.map((preset) => (
            <div key={preset.id}>
              <button
                type="button"
                onClick={() => !preset.needsInput && handlePresetClick(preset)}
                disabled={loading}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-lg transition-colors disabled:opacity-50"
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
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-gray-400"
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
