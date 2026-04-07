'use client';

import { useState, useCallback } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';

interface CopilotChatProps {
  children: React.ReactNode;
  onChatOpenChange?: (open: boolean) => void;
}

export default function CopilotChat({ children, onChatOpenChange }: CopilotChatProps) {
  const [chatOpen, setChatOpen] = useState(false);

  const handleSetOpen = useCallback((open: boolean) => {
    setChatOpen(open);
    onChatOpenChange?.(open);
  }, [onChatOpenChange]);

  return (
    <CopilotKit runtimeUrl="http://localhost:4000/api/chat/copilot">
      {children}
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
        .copilotKitButton {
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
          opacity: 0 !important;
          position: fixed !important;
          bottom: 0 !important;
          right: 0 !important;
        }
      `}</style>
    </CopilotKit>
  );
}
