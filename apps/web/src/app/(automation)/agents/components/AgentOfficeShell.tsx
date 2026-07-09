'use client';

import { RefreshCw } from 'lucide-react';
import { AgentActivityDrawer } from './AgentActivityDrawer';
import { AgentCommandBar } from './AgentCommandBar';
import { AgentInspector } from './AgentInspector';
import { AgentOfficeMap } from './AgentOfficeMap';
import { AgentStatusRail } from './AgentStatusRail';
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
  const selectedNode =
    selectedNodeId === null
      ? null
      : model.nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-[var(--text-primary)]">
            Agent OS HQ
          </h1>
          <p className="truncate text-xs text-[var(--text-tertiary)]">
            Operator · Hermes · KidItem MCP
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          aria-label="새로고침"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </header>
      <AgentStatusRail totals={model.totals} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
        <AgentOfficeMap
          nodes={model.nodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
        <AgentInspector node={selectedNode} />
      </div>
      <AgentActivityDrawer activities={model.activities} />
      <AgentCommandBar
        value={command}
        pending={commandPending}
        onChange={onCommandChange}
        onSubmit={onSubmitCommand}
      />
    </div>
  );
}
