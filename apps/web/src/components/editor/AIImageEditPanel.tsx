'use client';

import { API_BASE } from '@/lib/api';
import {
  ChevronDown,
  ChevronUp,
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
  { id: 'remove_background', label: '배경 제거', icon: <Eraser size={14} /> },
  { id: 'remove_text', label: '텍스트 제거', icon: <Type size={14} /> },
  {
    id: 'replace_background',
    label: '배경 교체',
    icon: <Paintbrush size={14} />,
    needsInput: true,
    inputPlaceholder: '배경 스타일 (예: 깔끔한 흰색 스튜디오)',
  },
  { id: 'enhance', label: '화질 개선', icon: <Sparkles size={14} /> },
  { id: 'full_regenerate', label: '이미지 재생성', icon: <RefreshCw size={14} /> },
];

async function editImage(params: {
  image_url: string;
  preset: PresetType;
  user_prompt: string;
}): Promise<{ image_url: string }> {
  const res = await fetch(`${API_BASE}/api/images/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function AIImageEditPanel({ imageUrl, onEditComplete, onReplace, onClose }: AIImageEditPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [presetInput, setPresetInput] = useState<Record<string, string>>({});

  const handlePresetClick = useCallback(
    async (preset: PresetItem) => {
      if (preset.needsInput && !presetInput[preset.id]) return;

      setLoading(true);
      setLoadingPreset(preset.id);
      setError(null);
      try {
        const result = await editImage({
          image_url: imageUrl,
          preset: preset.id,
          user_prompt: presetInput[preset.id] || '',
        });
        onEditComplete(result.image_url);
      } catch (err) {
        setError(err instanceof Error ? err.message : '편집에 실패했습니다');
        setTimeout(() => setError(null), 4000);
      } finally {
        setLoading(false);
        setLoadingPreset(null);
      }
    },
    [imageUrl, presetInput, onEditComplete],
  );

  const handleCustomSubmit = useCallback(async () => {
    if (!customPrompt.trim()) return;
    setLoading(true);
    setLoadingPreset('custom');
    setError(null);
    try {
      const result = await editImage({
        image_url: imageUrl,
        preset: 'custom',
        user_prompt: customPrompt.trim(),
      });
      onEditComplete(result.image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '편집에 실패했습니다');
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
      setLoadingPreset(null);
    }
  }, [imageUrl, customPrompt, onEditComplete]);

  return (
    <div className="w-[280px] bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-bold text-gray-700">이미지 편집</span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {loading && (
        <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700">AI 편집 중...</span>
        </div>
      )}

      <div className="px-3 pt-3 pb-2">
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
          <img src={imageUrl} alt="편집 대상" className="w-full h-[120px] object-contain" />
        </div>
      </div>

      <div className="px-3 pb-1 space-y-1">
        {PRESETS.map((preset) => (
          <div key={preset.id}>
            <button
              type="button"
              onClick={() => !preset.needsInput && handlePresetClick(preset)}
              disabled={loading}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPreset === preset.id ? <Loader2 size={14} className="animate-spin" /> : preset.icon}
              {preset.label}
            </button>
            {preset.needsInput && (
              <div className="flex gap-1 mt-1 mb-1">
                <input
                  type="text"
                  value={presetInput[preset.id] || ''}
                  onChange={(e) => setPresetInput((p) => ({ ...p, [preset.id]: e.target.value }))}
                  placeholder={preset.inputPlaceholder}
                  disabled={loading}
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  onKeyDown={(e) => e.key === 'Enter' && handlePresetClick(preset)}
                />
                <button
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  disabled={loading || !presetInput[preset.id]}
                  className="px-2 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <Replace size={14} />
          이미지 교체
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-1"
        >
          {showCustom ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          직접 입력
        </button>
        {showCustom && (
          <div className="space-y-1.5">
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="원하는 편집 내용을 입력하세요..."
              disabled={loading}
              rows={3}
              className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleCustomSubmit}
              disabled={loading || !customPrompt.trim()}
              className="w-full py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingPreset === 'custom' ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'AI 편집 적용'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="px-3 pb-2 text-xs text-red-500 font-medium">{error}</div>}
    </div>
  );
}
