'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAgentContext, useDefaultRenderTool } from '@copilotkit/react-core/v2';
import { projectDashboardContext } from './dashboard-context';
import { InteractionResultRenderer } from './renderers';

export function InteractionRegistration({
  onSend,
  latestSuggestionMessageId,
  toolMessageIdByCall,
  threadId,
}: {
  onSend?: (content: string) => void;
  latestSuggestionMessageId: string | null;
  toolMessageIdByCall: Record<string, string>;
  threadId: string;
}) {
  const pathname = usePathname();
  const value = useMemo(() => projectDashboardContext({
    routeKey: routeKeyForPath(pathname),
    resourceRefs: [],
    filters: {},
    visibleRowIds: [],
    aggregateSummary: {},
    locale: typeof navigator === 'undefined' ? 'ko-KR' : navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
  }), [pathname]);

  useAgentContext({ description: '현재 KidItem 화면의 허용된 대시보드 컨텍스트', value });
  useDefaultRenderTool({
    render: ({ name, toolCallId, status, result }) => {
      if (status !== 'complete') return <p>{name} 실행 중</p>;
      if (!result) return <p>{name} 결과가 없습니다.</p>;
      try {
        return <InteractionResultRenderer
          result={JSON.parse(result)}
          onSend={onSend}
          messageIdentity={toolMessageIdByCall[toolCallId] ?? null}
          latestSuggestionMessageId={latestSuggestionMessageId}
          threadId={threadId}
        />;
      } catch {
        return <p>{result.slice(0, 2_000)}</p>;
      }
    },
  }, [latestSuggestionMessageId, onSend, threadId, toolMessageIdByCall]);
  return null;
}

function routeKeyForPath(pathname: string): string {
  if (pathname.startsWith('/agent-os')) return 'agent_os';
  if (pathname.startsWith('/stock-ops')) return 'inventory_stock_ops';
  if (pathname.startsWith('/sourcing-ai/recommendations')) return 'sourcing_recommendations';
  return 'dashboard';
}
