'use client';

import { useState, useCallback, useEffect } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface CopilotChatProps {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  onChatOpenChange?: (open: boolean) => void;
}

/**
 * CopilotKit 은 자체 GraphQL runtime client 를 사용해 apiClient 우회.
 * Supabase 세션 access token 을 dynamic 하게 헤더에 주입.
 */
export default function CopilotChat({ children, defaultOpen = false, onChatOpenChange }: CopilotChatProps) {
  const [chatOpen, setChatOpen] = useState(defaultOpen);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data }) => {
        if (mounted) setAccessToken(data.session?.access_token ?? null);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (mounted) setAccessToken(session?.access_token ?? null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Supabase 키 미설정 — 토큰 없는 상태로 진행. CopilotKit 호출 시 401.
    }
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const handleSetOpen = useCallback((open: boolean) => {
    setChatOpen(open);
    onChatOpenChange?.(open);
  }, [onChatOpenChange]);

  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

  return (
    <CopilotKit
      runtimeUrl="http://localhost:4000/api/chat/copilot"
      headers={headers}
    >
      {children}
      <CopilotSidebar
        defaultOpen={defaultOpen}
        clickOutsideToClose
        hitEscapeToClose
        onSetOpen={handleSetOpen}
        labels={{
          title: 'KIDITEM AI',
          initial: '광고/재고/가격 전략에 대해 무엇이든 물어보세요.',
          placeholder: '메시지를 입력하세요...',
        }}
      />
      <style>{`
        .copilotKitButton,
        .copilotKitButton * {
          display: none !important;
        }
      `}</style>
    </CopilotKit>
  );
}
