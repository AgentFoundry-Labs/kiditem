'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import Sidebar from './Sidebar';

const COPILOT_INSTRUCTIONS = `당신은 KIDITEM 이커머스 운영 AI 어시스턴트입니다.
쿠팡 키즈용품 셀러의 광고, 재고, 가격, 매출 전략을 도와줍니다.
한국어로 간결하게 답변하세요.
사용자가 제공하는 대시보드 데이터를 참고하여 인사이트를 제공하세요.`;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);

  const toggleChat = useCallback(() => {
    // CopilotSidebar 내부 버튼을 클릭하여 열기/닫기 트리거
    const btn = document.querySelector('.copilotKitButton') as HTMLButtonElement | null;
    if (btn) btn.click();
  }, []);

  if (pathname.includes('/editor')) {
    return <>{children}</>;
  }

  return (
    <CopilotKit runtimeUrl="http://localhost:4000/api/copilotkit">
      <div className="min-h-screen bg-slate-50">
        <Sidebar onChatToggle={toggleChat} chatOpen={chatOpen} />
        <div
          className={cn(
            'transition-all duration-300',
            sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]'
          )}
        >
          <main className="p-6">{children}</main>
        </div>
        <CopilotSidebar
          defaultOpen={false}
          clickOutsideToClose
          hitEscapeToClose
          onSetOpen={setChatOpen}
          instructions={COPILOT_INSTRUCTIONS}
          labels={{
            title: 'KIDITEM AI',
            initial: '광고/재고/가격 전략에 대해 무엇이든 물어보세요.',
            placeholder: '메시지를 입력하세요...',
          }}
        />
      </div>
      {/* CopilotSidebar 기본 플로팅 버튼 시각적 숨김 (JS click은 유지) */}
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
