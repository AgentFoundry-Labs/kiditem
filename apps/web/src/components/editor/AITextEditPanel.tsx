'use client';

import { API_BASE } from '@/lib/api';
import {
  AlignLeft,
  Check,
  Languages,
  Loader2,
  RefreshCw,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface AITextEditPanelProps {
  component: any;
  editor: any;
  isBusy: React.MutableRefObject<boolean>;
  onClose: () => void;
}

async function transformText(params: {
  text: string;
  preset: 'rewrite' | 'translate' | 'shorten' | 'custom';
  custom_prompt?: string;
}): Promise<{ result: string }> {
  const res = await fetch(`${API_BASE}/api/text-ai/transform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function applyTextToComponent(component: any, newText: string): void {
  const children = component.components();
  if (children && children.length > 0) {
    children.reset([{ type: 'textnode', content: newText }]);
  } else {
    component.set('content', newText);
  }
}

const PRESETS = [
  { id: 'rewrite' as const, label: '다시쓰기', icon: Wand2 },
  { id: 'translate' as const, label: '번역', icon: Languages },
  { id: 'shorten' as const, label: '축약', icon: AlignLeft },
];

export function AITextEditPanel({
  component,
  editor,
  isBusy,
  onClose,
}: AITextEditPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const [lastPreset, setLastPreset] = useState<string | null>(null);

  const originalText = useMemo(() => {
    try {
      const el = component.getEl?.();
      if (el?.textContent) return el.textContent.trim();
      const html = component.getInnerHTML?.() ?? '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent?.trim() ?? '';
    } catch {
      return '';
    }
  }, [component]);

  const runTransform = useCallback(
    async (preset: 'rewrite' | 'translate' | 'shorten' | 'custom', customInput?: string) => {
      if (isBusy.current) return;
      isBusy.current = true;
      setLoading(true);
      setLoadingPreset(preset);
      setError(null);
      setPendingResult(null);
      try {
        const text = component.getInnerHTML();
        const result = await transformText({
          text,
          preset,
          custom_prompt: customInput,
        });
        setPendingResult(result.result);
        setLastPreset(preset);
      } catch {
        setError('변환에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        isBusy.current = false;
        setLoading(false);
        setLoadingPreset(null);
      }
    },
    [component, isBusy],
  );

  const handleApplyResult = useCallback(() => {
    if (!pendingResult) return;
    const um = editor.UndoManager;
    um.stop();
    try {
      applyTextToComponent(component, pendingResult);
    } finally {
      um.start();
    }
    setPendingResult(null);
    setLastPreset(null);
  }, [pendingResult, component, editor]);

  const handleRegenerate = useCallback(() => {
    if (!lastPreset) return;
    if (lastPreset === 'custom') {
      runTransform('custom', customPrompt.trim());
    } else {
      runTransform(lastPreset as 'rewrite' | 'translate' | 'shorten');
    }
  }, [lastPreset, customPrompt, runTransform]);

  const handleDismissResult = useCallback(() => {
    setPendingResult(null);
    setLastPreset(null);
  }, []);

  const handleCustomSubmit = useCallback(() => {
    if (!customPrompt.trim()) return;
    runTransform('custom', customPrompt.trim());
  }, [customPrompt, runTransform]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 space-y-3">
        <div>
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">원본</span>
          <p className="mt-1 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed line-clamp-4 border border-gray-100">
            {originalText || '(텍스트 없음)'}
          </p>
        </div>

        <div className="flex gap-1.5">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isActive = loadingPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => runTransform(preset.id)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActive ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                {preset.label}
              </button>
            );
          })}
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
            placeholder="원하는 변환 내용을 입력하세요..."
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
            {loadingPreset === 'custom' ? (
              <Loader2 size={14} className="animate-spin mx-auto" />
            ) : (
              'AI 텍스트 변환'
            )}
          </button>
        </div>

        {pendingResult && (
          <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-emerald-100/60">
              <span className="text-[11px] font-semibold text-emerald-700">AI 결과</span>
            </div>
            <p className="px-3 py-2 text-xs text-gray-700 leading-relaxed">
              {pendingResult}
            </p>
            <div className="flex gap-1.5 px-3 py-2 border-t border-emerald-100">
              <button
                type="button"
                onClick={handleApplyResult}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-md transition-colors"
              >
                <Check size={13} />
                적용
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={loading}
                className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} />
              </button>
              <button
                type="button"
                onClick={handleDismissResult}
                className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg border border-red-100">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
