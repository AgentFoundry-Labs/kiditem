'use client';

import type { Agent } from '../../lib/agent-types';

interface Props {
  agents: Agent[];
}

export default function NoSkillAgentsList({ agents }: Props) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-400">스킬 없는 에이전트</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {agents.map((agent) => (
          <span
            key={agent.id}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500"
          >
            <span className="w-5 h-5 rounded bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600">
              {agent.name.charAt(0).toUpperCase()}
            </span>
            {agent.name}
          </span>
        ))}
      </div>
    </div>
  );
}
