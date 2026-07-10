'use client';

import { useState } from 'react';
import { AgentActivityDrawer } from './AgentActivityDrawer';
import { AgentCommandDock } from './AgentCommandDock';
import { AgentInspector } from './AgentInspector';
import { AgentOfficeHeader } from './AgentOfficeHeader';
import { AgentOfficeMap } from './AgentOfficeMap';
import { AgentStaffPanel } from './AgentStaffPanel';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

export function AgentOfficeShell({
  model,
  selectedNodeId,
  command,
  commandPending,
  refreshing,
  onSelectNode,
  onCommandChange,
  onSubmitCommand,
  onRefresh,
}: {
  model: AgentOfficeViewModel;
  selectedNodeId: string | null;
  command: string;
  commandPending: boolean;
  refreshing: boolean;
  onSelectNode: (id: string) => void;
  onCommandChange: (value: string) => void;
  onSubmitCommand: () => void;
  onRefresh: () => void;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const selectedNode =
    selectedNodeId === null
      ? null
      : model.nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <div
      data-testid="agent-office-theme-root"
      className="min-h-screen min-w-[1080px] overflow-hidden bg-slate-50 text-slate-900"
    >
      <div className="flex h-screen flex-col gap-3 p-3">
        <AgentOfficeHeader
          totals={model.totals}
          refreshing={refreshing}
          activityOpen={activityOpen}
          onRefresh={onRefresh}
          onToggleActivity={() => setActivityOpen((open) => !open)}
        />
        <main
          data-testid="agent-office-workspace"
          className="grid min-h-0 flex-1 grid-cols-[240px_minmax(480px,1fr)_300px] grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden"
        >
          <div
            data-testid="agent-office-staff-rail"
            className="row-span-2 min-h-0 overflow-y-auto"
          >
            <AgentStaffPanel
              model={model}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          </div>

          <div
            data-testid="agent-office-viewport"
            className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm"
          >
            <AgentOfficeMap
              className="h-full min-h-0"
              nodes={model.nodes}
              activities={model.activities}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          </div>

          <div
            data-testid="agent-office-detail-rail"
            className="row-span-2 flex min-h-0 flex-col gap-3 overflow-y-auto"
          >
            <AgentInspector node={selectedNode} />
            {activityOpen ? (
              <AgentActivityDrawer activities={model.activities} />
            ) : null}
          </div>

          <div
            data-testid="agent-office-command-row"
            className="min-w-0"
          >
            <AgentCommandDock
              node={selectedNode}
              value={command}
              pending={commandPending}
              onChange={onCommandChange}
              onSubmit={onSubmitCommand}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
