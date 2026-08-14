'use client';

import { X } from 'lucide-react';
import { AgentInteractionProvider } from '@/components/agent-interaction/AgentInteractionProvider';
import { AgentInteractionSurface } from '@/components/agent-interaction/AgentInteractionSurface';

export function AgentOsInteractionWorkspace({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <section
      aria-label="AgentOS conversation workspace"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex justify-end border-b p-2">
        <button type="button" aria-label="대화 닫기" onClick={onClose} className="rounded-md p-2 hover:bg-muted">
          <X size={20} />
        </button>
      </div>
      <AgentInteractionProvider>
        <AgentInteractionSurface surface="agentos_workspace" className="min-h-0 flex-1" />
      </AgentInteractionProvider>
    </section>
  );
}
