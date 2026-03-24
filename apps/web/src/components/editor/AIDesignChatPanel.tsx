'use client';

import { API_BASE } from '@/lib/api';
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Send, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

interface AIDesignChatPanelProps {
  getHtml: () => string;
  getCss: () => string;
  onApply: (html: string) => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function AIDesignChatPanel({ getHtml, getCss, onApply, onUndo, canUndo }: AIDesignChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const currentHtml = getHtml();
      const currentCss = getCss();
      const fullHtml = currentCss ? `${currentHtml}\n<style>${currentCss}</style>` : currentHtml;

      const res = await fetch(`${API_BASE}/api/templates/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: fullHtml, prompt }),
      });

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text()}`);
      }

      const result = (await res.json()) as { html: string };
      onApply(result.html);
      setMessages((prev) => [...prev, { role: 'ai', content: `수정 완료: "${prompt}"`, timestamp: Date.now() }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '수정에 실패했습니다';
      setMessages((prev) => [...prev, { role: 'ai', content: `오류: ${msg}`, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, getHtml, getCss, onApply]);

  return (
    <div className={`border-t border-gray-200 flex flex-col ${expanded ? 'flex-1 min-h-0' : 'shrink-0'}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors shrink-0"
      >
        <div className="flex items-center gap-1.5">
          <MessageSquare size={12} className="text-emerald-500" />
          <span className="text-xs font-bold text-gray-700">AI 디자인</span>
          {messages.length > 0 && <span className="text-[10px] text-gray-400">{messages.length}</span>}
        </div>
        <div className="flex items-center gap-1">
          {expanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUndo();
              }}
              disabled={!canUndo}
              title="되돌리기"
              className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors disabled:opacity-30"
            >
              <Undo2 size={11} />
            </button>
          )}
          {expanded ? (
            <ChevronDown size={12} className="text-gray-400" />
          ) : (
            <ChevronUp size={12} className="text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <p className="text-[10px] text-gray-400 mb-2">디자인 수정을 요청하세요</p>
                <div className="space-y-1">
                  {['배경을 검정으로 바꿔줘', '폰트를 더 크게', '더 고급스러운 느낌으로'].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setInput(example)}
                      className="block w-full text-left px-2 py-1 text-[10px] text-gray-500 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 rounded transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.timestamp} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[200px] px-2 py-1 rounded-lg text-[10px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-500 text-white rounded-br-sm'
                      : msg.content.startsWith('오류')
                        ? 'bg-red-50 text-red-600 rounded-bl-sm'
                        : 'bg-gray-100 text-gray-700 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg rounded-bl-sm">
                  <Loader2 size={10} className="animate-spin text-emerald-500" />
                  <span className="text-[10px] text-gray-500">수정 중...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-gray-100 p-2 shrink-0">
            <div className="flex gap-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="디자인을 어떻게 바꿀까요?"
                disabled={loading}
                rows={1}
                className="flex-1 px-2 py-1.5 text-[10px] border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !input.trim()}
                className="p-1.5 text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
