'use client';

import type { ReactNode } from 'react';
import { CopilotKit } from '@copilotkit/react-core/v2';

const COPILOTKIT_TRANSPORT = {
  runtimeUrl: '/api/copilotkit',
  credentials: 'include',
  useSingleEndpoint: true,
} as const;

/** Public 1.69 single-route transport mounted by the authenticated Nest adapter. */
export function ConversationProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKit {...COPILOTKIT_TRANSPORT}>
      {children}
    </CopilotKit>
  );
}
