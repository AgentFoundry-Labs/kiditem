'use client';

import Link from 'next/link';
import { Puzzle, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '../../lib/agent-types';
import type { Agent } from '../../lib/agent-types';

const SKILL_COLORS: Record<string, string> = {
  'db-query': 'bg-purple-50 text-purple-600 border-purple-100',
  'result-callback': 'bg-green-50 text-green-600 border-green-100',
  'coupang-browse': 'bg-amber-50 text-amber-600 border-amber-100',
  'kiditem-api': 'bg-violet-50 text-violet-600 border-violet-100',
  'data-analysis': 'bg-cyan-50 text-cyan-600 border-cyan-100',
};
const DEFAULT_SKILL_COLOR = 'bg-slate-50 text-slate-600 border-slate-200';

export interface SkillEntry {
  name: string;
  description: string;
  agents: Agent[];
}

interface Props {
  skills: SkillEntry[];
}

export default function SkillCardGrid({ skills }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      {skills.map((skill) => {
        const colorClass = SKILL_COLORS[skill.name] ?? DEFAULT_SKILL_COLOR;
        return (
          <div
            key={skill.name}
            className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', colorClass)}>
                <Puzzle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 font-mono">{skill.name}</p>
                {skill.description && (
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{skill.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mr-1">
                사용 에이전트
              </span>
              {skill.agents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] hover:bg-slate-200 hover:text-slate-900 transition-colors"
                  title={ROLE_LABELS[agent.role] ?? agent.role}
                >
                  <Bot className="w-2.5 h-2.5" />
                  {agent.name}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
