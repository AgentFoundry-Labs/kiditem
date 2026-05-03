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

// CopilotKit 은 자체 GraphQL runtime client 를 사용해 apiClient 우회.
// Phase 0.1 DevAuthMiddleware 연동을 위해 x-dev-user-id 헤더 명시 주입.
// prod 인증 전환 시 실제 토큰으로 교체.
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID;
const COPILOT_HEADERS = DEV_USER_ID ? { 'x-dev-user-id': DEV_USER_ID } : undefined;

export default function CopilotChat({ children, defaultOpen = false, onChatOpenChange }: CopilotChatProps) {
  const [chatOpen, setChatOpen] = useState(defaultOpen);

  const handleSetOpen = useCallback((open: boolean) => {
    setChatOpen(open);
    onChatOpenChange?.(open);
  }, [onChatOpenChange]);

  return (
    <CopilotKit
      runtimeUrl="http://localhost:4000/api/chat/copilot"
      headers={COPILOT_HEADERS}
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
