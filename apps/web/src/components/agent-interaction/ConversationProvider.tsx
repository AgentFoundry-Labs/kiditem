'use client';

import type { ReactNode } from 'react';
import { CopilotKit } from '@copilotkit/react-core/v2';
import { getAuthSession } from '@/lib/auth/session';

function conversationHeaders(): Record<string, string> {
  const token = getAuthSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Public 1.69 single-route transport mounted by the authenticated Nest adapter. */
export function ConversationProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      credentials="include"
      headers={conversationHeaders}
      useSingleEndpoint
    >
      {children}
    </CopilotKit>
  );
}
