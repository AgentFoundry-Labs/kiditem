'use client';

import { apiClient } from '@/lib/api-client';
import { Loader2, Send, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  const modifyTemplate = useMutation({
    mutationFn: ({ html, prompt }: { html: string; prompt: string }) =>
      apiClient.post<{ html: string }>('/api/templates/modify', { html, prompt }),
    onSuccess: (result, { prompt }) => {
      onApply(result.html);
      setMessages((prev) => [...prev, { role: 'ai', content: `수정 완료: "${prompt}"`, timestamp: Date.now() }]);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : '수정에 실패했습니다';
      setMessages((prev) => [...prev, { role: 'ai', content: `오류: ${msg}`, timestamp: Date.now() }]);
    },
    onSettled: () => {
      inputRef.current?.focus();
    },
  });

  const loading = modifyTemplate.isPending;

  const handleSubmit = () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);

    const currentHtml = getHtml();
    const currentCss = getCss();
    const fullHtml = currentCss ? `${currentHtml}\n<style>${currentCss}</style>` : currentHtml;
    modifyTemplate.mutate({ html: fullHtml, prompt });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-gray-400 mb-3">디자인 수정을 요청하세요</p>
            <div className="space-y-1.5">
              {['배경을 검정으로 바꿔줘', '폰트를 더 크게', '더 고급스러운 느낌으로'].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setInput(example)}
                  className="block w-full text-left px-3 py-2 text-xs text-gray-500 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors"
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
              className={`max-w-[240px] px-3 py-2 rounded-xl text-xs leading-relaxed ${
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
            <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-xl rounded-bl-sm">
              <Loader2 size={12} className="animate-spin text-emerald-500" />
              <span className="text-xs text-gray-500">수정 중...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="border-t border-gray-200 p-3 shrink-0">
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2 transition-colors"
          >
            <Undo2 size={12} />
            되돌리기
          </button>
        )}
        <div className="flex gap-1.5">
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
            rows={2}
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="p-2 text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 self-end"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
