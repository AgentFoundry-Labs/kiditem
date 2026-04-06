'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import type { Agent, OrgNode, ViewMode } from '../lib/agent-types';
import { AgentListRow } from './AgentListRow';
import { OrgTreeNode } from './OrgTreeNode';

interface AgentListPanelProps {
  agents: Agent[];
  filtered: Agent[];
  filteredOrg: OrgNode[];
  orgTree: OrgNode[];
  view: ViewMode;
  agentMap: Map<string, Agent>;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  runningAgentId: string | null;
}

export function AgentListPanel({
  agents,
  filtered,
  filteredOrg,
  orgTree,
  view,
  agentMap,
  onNavigate,
  onDelete,
  onRun,
  runningAgentId,
}: AgentListPanelProps) {
  return (
    <>
      {/* Agent count */}
      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length}개 에이전트
          {agents.filter(a => a.status === 'running').length > 0 && (
            <> · <span className="text-cyan-600">{agents.filter(a => a.status === 'running').length}개 실행 중</span></>
          )}
        </p>
      )}

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border border-gray-200 rounded-lg">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Bot className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">등록된 에이전트가 없습니다.</p>
          <Link href="/marketplace" className="text-xs text-blue-500 hover:text-blue-600 mt-1">
            마켓플레이스에서 에이전트를 설치하세요 →
          </Link>
        </div>
      )}

      {/* List view */}
      {view === 'list' && filtered.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {filtered.map((agent) => (
            <AgentListRow
              key={agent.id}
              agent={agent}
              onClick={() => onNavigate(agent.id)}
              onDelete={onDelete}
              onRun={onRun}
              isRunning={runningAgentId === agent.id}
            />
          ))}
        </div>
      )}

      {view === 'list' && agents.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">필터에 맞는 에이전트가 없습니다.</p>
      )}

      {/* Org view */}
      {view === 'org' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {filteredOrg.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {orgTree.length === 0 ? '조직 구조가 정의되지 않았습니다.' : '필터에 맞는 에이전트가 없습니다.'}
            </p>
          ) : (
            filteredOrg.map((node) => (
              <OrgTreeNode
                key={node.id}
                node={node}
                depth={0}
                agentMap={agentMap}
                onNavigate={onNavigate}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}
