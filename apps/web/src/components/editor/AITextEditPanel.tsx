'use client';

import { API_BASE } from '@/lib/api';
import {
  AlignLeft,
  ChevronDown,
  ChevronUp,
  Languages,
  Loader2,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

interface AITextEditPanelProps {
  component: any; // GrapesJS Component model
  editor: any; // GrapesJS Editor instance
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

/**
 * Applies AI-generated text to a GrapesJS component, handling nested HTML safely.
 *
 * RESEARCH.md open question #1: `component.set('content', newText)` may destroy
 * nested HTML children (e.g. <strong>, <em> inside a <p>). This helper checks
 * whether the component has child components and uses the appropriate strategy:
 *
 * - Leaf text (no children): `component.set('content', newText)` -- simple replacement.
 * - Has children (nested HTML): `component.components().reset([{ type: 'textnode', content: newText }])`
 *   -- replaces all children with a single text node, preserving the parent tag structure.
 */
function applyTextToComponent(component: any, newText: string): void {
  const children = component.components();
  if (children && children.length > 0) {
    // Component has nested HTML (e.g. <p><strong>text</strong></p>).
    // Using set('content') would destroy the component tree.
    // Reset to a single textnode to safely replace all children.
    children.reset([{ type: 'textnode', content: newText }]);
  } else {
    // Plain text component with no children -- direct set is safe.
    component.set('content', newText);
  }
}

export function AITextEditPanel({
  component,
  editor,
  isBusy,
  onClose,
}: AITextEditPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const handlePresetClick = useCallback(
    async (preset: 'rewrite' | 'translate' | 'shorten') => {
      if (isBusy.current) return;
      isBusy.current = true;
      setLoading(true);
      setLoadingPreset(preset);
      setError(null);
      try {
        const originalText = component.getInnerHTML();
        const result = await transformText({ text: originalText, preset });
        const um = editor.UndoManager;
        um.stop();
        try {
          applyTextToComponent(component, result.result);
        } finally {
          um.start();
        }
      } catch {
        setError('변환에 실패했습니다. 다시 시도해 주세요.');
        setTimeout(() => setError(null), 4000);
      } finally {
        isBusy.current = false;
        setLoading(false);
        setLoadingPreset(null);
      }
    },
    [component, editor, isBusy],
  );

  const handleCustomSubmit = useCallback(async () => {
    if (!customPrompt.trim()) return;
    if (isBusy.current) return;
    isBusy.current = true;
    setLoading(true);
    setLoadingPreset('custom');
    setError(null);
    try {
      const originalText = component.getInnerHTML();
      const result = await transformText({
        text: originalText,
        preset: 'custom',
        custom_prompt: customPrompt.trim(),
      });
      const um = editor.UndoManager;
      um.stop();
      try {
        applyTextToComponent(component, result.result);
      } finally {
        um.start();
      }
    } catch {
      setError('변환에 실패했습니다. 다시 시도해 주세요.');
      setTimeout(() => setError(null), 4000);
    } finally {
      isBusy.current = false;
      setLoading(false);
      setLoadingPreset(null);
    }
  }, [component, editor, isBusy, customPrompt]);

  return (
    <div className="w-[280px] bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <Wand2 size={14} className="text-gray-500" />
          <span className="text-xs font-bold text-gray-700">텍스트 편집</span>
        </div>
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
          <span className="text-xs font-bold text-emerald-700">
            AI 변환 중...
          </span>
        </div>
      )}

      <div className="px-3 pt-3 pb-1 space-y-1">
        <button
          type="button"
          onClick={() => handlePresetClick('rewrite')}
          disabled={loading}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingPreset === 'rewrite' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Wand2 size={14} />
          )}
          다시쓰기
        </button>
        <button
          type="button"
          onClick={() => handlePresetClick('translate')}
          disabled={loading}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingPreset === 'translate' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Languages size={14} />
          )}
          번역
        </button>
        <button
          type="button"
          onClick={() => handlePresetClick('shorten')}
          disabled={loading}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingPreset === 'shorten' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <AlignLeft size={14} />
          )}
          축약
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
              placeholder="원하는 변환 내용을 입력하세요..."
              disabled={loading}
              rows={3}
              className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleCustomSubmit}
              disabled={loading || !customPrompt.trim()}
              className="w-full py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingPreset === 'custom' ? (
                <Loader2 size={14} className="animate-spin mx-auto" />
              ) : (
                'AI 텍스트 적용'
              )}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 pb-2 text-xs text-red-500 font-bold">
          {error}
        </div>
      )}
    </div>
  );
}
