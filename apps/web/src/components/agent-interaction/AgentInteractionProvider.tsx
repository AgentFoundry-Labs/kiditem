'use client';

import type { ReactNode } from 'react';
import { CopilotKitProvider } from '@copilotkit/react-core/v2';
import { officialInteractionActivityRenderers } from './OfficialInteractionRenderers';

export function AgentInteractionProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      credentials="include"
      renderActivityMessages={officialInteractionActivityRenderers}
    >
      {children}
    </CopilotKitProvider>
  );
}
