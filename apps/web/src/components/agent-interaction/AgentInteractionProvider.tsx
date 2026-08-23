'use client';

import type { ReactNode } from 'react';
import { CopilotKit } from '@copilotkit/react-core/v2';

export function AgentInteractionProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      credentials="include"
    >
      {children}
    </CopilotKit>
  );
}
