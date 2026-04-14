'use client';

import { useState, useCallback } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';

interface CopilotChatProps {
  children: React.ReactNode;
  onChatOpenChange?: (open: boolean) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CopilotChat({ children, onChatOpenChange }: CopilotChatProps) {
  const safeChildren = children as any;
  const [chatOpen, setChatOpen] = useState(false);

  const handleSetOpen = useCallback((open: boolean) => {
    setChatOpen(open);
    onChatOpenChange?.(open);
  }, [onChatOpenChange]);

  return (
    <CopilotKit runtimeUrl="http://localhost:4000/api/chat/copilot">
      {safeChildren}
      <CopilotSidebar
        defaultOpen={false}
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
