'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  InteractionUiResultSchema,
  type InteractionUiResult,
  type SuggestedRepliesResult,
} from '@kiditem/shared/agent-interaction';
import { apiClient } from '@/lib/api-client';

const ALLOWED_HREFS = new Set(['/dashboard', '/agent-os', '/sourcing-ai/recommendations', '/stock-ops']);

export function SuggestedReplies({
  replies,
  isLatestMessage,
  onSend,
}: {
  replies: SuggestedRepliesResult['replies'];
  isLatestMessage: boolean;
  onSend: (content: string) => void;
}) {
  const [consumed, setConsumed] = useState(false);
  if (!isLatestMessage || consumed) return null;
  return (
    <div aria-label="추천 답변" className="flex flex-wrap gap-2">
      {replies.slice(0, 3).map((reply) => (
        <button
          key={reply.id}
          type="button"
          onClick={() => {
            setConsumed(true);
            onSend(reply.content);
          }}
          className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
}

function NavigationRenderer({ result }: { result: Extract<InteractionUiResult, { kind: 'navigation' }> }) {
  const router = useRouter();
  const expired = new Date(result.expiresAt).getTime() <= Date.now();
  const mutation = useMutation({
    mutationFn: () => apiClient.post<{ href: string }>('/api/agent-os/interaction/actions/authorize', { actionId: result.actionId }),
    onSuccess: ({ href }) => {
      if (ALLOWED_HREFS.has(href)) router.push(href);
    },
  });
  const reason = result.disabledReason ?? (expired ? '이동 요청이 만료되었습니다.' : null);
  return (
    <div className="space-y-2">
      <button type="button" disabled={Boolean(reason) || mutation.isPending} onClick={() => mutation.mutate()} className="rounded-md border px-3 py-2 disabled:opacity-50">
        {result.label}
      </button>
      {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
      {mutation.isError ? <p role="alert" className="text-sm text-destructive">이동 권한을 확인하지 못했습니다.</p> : null}
      <p className="sr-only">{result.textFallback}</p>
    </div>
  );
}

function fallbackFrom(value: unknown): string {
  if (value && typeof value === 'object' && 'textFallback' in value) {
    const fallback = (value as { textFallback?: unknown }).textFallback;
    if (typeof fallback === 'string' && fallback.trim()) return fallback.slice(0, 2_000);
  }
  return '지원하지 않는 응답입니다.';
}

export function InteractionResultRenderer({ result }: { result: unknown }) {
  const parsed = InteractionUiResultSchema.safeParse(result);
  if (!parsed.success) return <p>{fallbackFrom(result)}</p>;
  const value = parsed.data;
  switch (value.kind) {
    case 'metric_group':
      return <section><h3>{value.title}</h3><dl>{value.items.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><p className="sr-only">{value.textFallback}</p></section>;
    case 'notice':
      return <aside role={value.tone === 'error' ? 'alert' : 'status'}><h3>{value.title}</h3><p>{value.body}</p><p className="sr-only">{value.textFallback}</p></aside>;
    case 'resource_list':
      return <section><h3>{value.title}</h3><ul>{value.items.map((item) => <li key={`${item.resourceRef.kind}:${item.resourceRef.id}`}><strong>{item.label}</strong>{item.description ? <p>{item.description}</p> : null}</li>)}</ul><p className="sr-only">{value.textFallback}</p></section>;
    case 'comparison':
      return <section><h3>{value.title}</h3><table><thead><tr><th>항목</th>{value.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{value.rows.map((row) => <tr key={row.label}><th>{row.label}</th>{row.values.map((cell, index) => <td key={`${row.label}-${index}`}>{cell}</td>)}</tr>)}</tbody></table><p className="sr-only">{value.textFallback}</p></section>;
    case 'navigation':
      return <NavigationRenderer result={value} />;
    case 'suggested_replies':
      return <p>{value.textFallback}</p>;
  }
}
