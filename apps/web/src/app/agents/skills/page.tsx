'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Puzzle, RefreshCw, Search, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { agentApi } from '@/lib/agent-api';
import { ROLE_LABELS, SKILL_DESCRIPTIONS } from '@/lib/agent-types';
import type { Agent } from '@/lib/agent-types';

const SKILL_COLORS: Record<string, string> = {
  'db-query': 'bg-blue-50 text-blue-600 border-blue-100',
  'result-callback': 'bg-green-50 text-green-600 border-green-100',
  'coupang-browse': 'bg-amber-50 text-amber-600 border-amber-100',
  'kiditem-api': 'bg-violet-50 text-violet-600 border-violet-100',
  'data-analysis': 'bg-cyan-50 text-cyan-600 border-cyan-100',
};
const DEFAULT_SKILL_COLOR = 'bg-gray-50 text-gray-600 border-gray-200';

interface SkillEntry {
  name: string;
  description: string;
  agents: Agent[];
}

export default function SkillsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const data = await agentApi.list();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Build skill -> agents map
  const skills: SkillEntry[] = useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const agent of agents) {
      for (const skill of agent.skills ?? []) {
        if (!map.has(skill)) map.set(skill, []);
        map.get(skill)!.push(agent);
      }
    }
    const entries: SkillEntry[] = Array.from(map.entries()).map(([name, agts]) => ({
      name,
      description: SKILL_DESCRIPTIONS[name] ?? '',
      agents: agts,
    }));
    return entries.sort((a, b) => {
      if (b.agents.length !== a.agents.length) return b.agents.length - a.agents.length;
      return a.name.localeCompare(b.name);
    });
  }, [agents]);

  const filtered = useMemo(
    () => skills.filter((s) =>
      !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.description.includes(query),
    ),
    [skills, query],
  );

  const noSkillAgents = agents.filter((a) => !a.skills || a.skills.length === 0);

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <PageSkeleton variant="cards" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-gray-400">{skills.length}개 스킬 · {agents.length}개 에이전트</p>
        <button
          onClick={fetchAll}
          className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="스킬 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-white placeholder-gray-400"
        />
      </div>

      {/* Empty state */}
      {skills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border border-gray-200 rounded-lg">
          <Puzzle className="w-8 h-8 mb-2" />
          <p className="text-sm">등록된 스킬이 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">에이전트에 스킬을 할당하거나 agent-config/skills/에 스킬을 추가하세요.</p>
        </div>
      )}

      {/* No search results */}
      {skills.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">검색 결과가 없습니다.</p>
      )}

      {/* Skill cards grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {filtered.map((skill) => {
            const colorClass = SKILL_COLORS[skill.name] ?? DEFAULT_SKILL_COLOR;
            return (
              <div
                key={skill.name}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', colorClass)}>
                    <Puzzle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 font-mono">{skill.name}</p>
                    {skill.description && (
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{skill.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mr-1">
                    사용 에이전트
                  </span>
                  {skill.agents.map((agent) => (
                    <Link
                      key={agent.id}
                      href={`/agents/${agent.id}`}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] hover:bg-gray-200 hover:text-gray-900 transition-colors"
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
      )}

      {/* Agents without skills */}
      {noSkillAgents.length > 0 && !query && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-gray-400">스킬 없는 에이전트</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {noSkillAgents.map((agent) => (
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
      )}
    </div>
  );
}
