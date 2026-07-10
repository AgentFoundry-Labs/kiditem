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
    <div className="min-h-screen min-w-[1080px] overflow-hidden bg-slate-950 text-white">
      <div className="flex min-h-screen flex-col gap-3 p-3">
        <AgentOfficeHeader
          totals={model.totals}
          refreshing={refreshing}
          activityOpen={activityOpen}
          onRefresh={onRefresh}
          onToggleActivity={() => setActivityOpen((open) => !open)}
        />
        <main className="relative min-h-[calc(100vh-80px)] flex-1 overflow-hidden rounded-lg border border-white/20 bg-slate-100 shadow-2xl shadow-black/25">
          <AgentOfficeMap
            className="absolute inset-0 min-h-full"
            nodes={model.nodes}
            activities={model.activities}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
          <div className="absolute left-4 top-4 z-20 w-[240px] xl:w-[272px]">
            <AgentStaffPanel
              model={model}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          </div>
          <div className="absolute right-4 top-4 z-20 w-[300px] xl:w-[340px]">
            <AgentInspector node={selectedNode} />
          </div>
          {activityOpen ? (
            <div className="absolute left-[272px] right-[316px] top-4 z-30 xl:left-[304px] xl:right-[356px]">
              <AgentActivityDrawer activities={model.activities} />
            </div>
          ) : null}
          <div className="absolute bottom-4 left-1/2 z-20 w-[680px] -translate-x-1/2">
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
