'use client';

import { useState, useCallback } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';

interface CopilotChatProps {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  onChatOpenChange?: (open: boolean) => void;
}

/**
 * CopilotKit browser runtime calls only same-origin `/api/chat/copilot`.
 * Next.js rewrites the path to the Nest chat runtime (see
 * `apps/web/next.config.mjs`), so the browser never references
 * `NEXT_PUBLIC_API_URL` / `API_BASE` for chat. This avoids cross-origin
 * cookie/CORS concerns and lets the existing Supabase SSR cookie
 * (`sb-<project-ref>-auth-token`) authenticate the request automatically.
 *
 * `credentials="include"` keeps the cookie attached on a same-origin
 * request — required for `fetch` defaults to omit credentials. We do NOT
 * fetch a Supabase access token in the browser and forward it as a Bearer
 * header; the SSR cookie covers it on both Next and Nest sides.
 */
export default function CopilotChat({ children, defaultOpen = false, onChatOpenChange }: CopilotChatProps) {
  const [chatOpen, setChatOpen] = useState(defaultOpen);

  const handleSetOpen = useCallback((open: boolean) => {
    setChatOpen(open);
    onChatOpenChange?.(open);
  }, [onChatOpenChange]);

  return (
    <CopilotKit
      runtimeUrl="/api/chat/copilot"
      credentials="include"
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
