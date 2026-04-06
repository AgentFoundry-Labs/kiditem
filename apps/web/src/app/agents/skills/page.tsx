'use client';

import { useState, useMemo } from 'react';
import { Puzzle, RefreshCw, Search } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { SKILL_DESCRIPTIONS } from '../lib/agent-types';
import type { Agent } from '../lib/agent-types';
import { useAgents } from '../hooks/useAgents';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import SkillCardGrid from './components/SkillCardGrid';
import type { SkillEntry } from './components/SkillCardGrid';
import NoSkillAgentsList from './components/NoSkillAgentsList';

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const { data: agents = [], isLoading: loading, error: queryError } = useAgents();
  const error = queryError ? '스킬 정보를 불러오는데 실패했습니다.' : null;
  const [query, setQuery] = useState('');

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
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-slate-400">{skills.length}개 스킬 · {agents.length}개 에이전트</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.agents.list() })}
          className="p-1.5 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="스킬 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white placeholder-slate-400"
        />
      </div>

      {/* Empty state */}
      {skills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-slate-200 rounded-lg">
          <Puzzle className="w-8 h-8 mb-2" />
          <p className="text-sm">등록된 스킬이 없습니다.</p>
          <p className="text-xs text-slate-400 mt-1">마켓플레이스에서 에이전트를 설치하면 스킬이 자동으로 등록됩니다.</p>
        </div>
      )}

      {/* No search results */}
      {skills.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">검색 결과가 없습니다.</p>
      )}

      {/* Skill cards grid */}
      {filtered.length > 0 && <SkillCardGrid skills={filtered} />}

      {/* Agents without skills */}
      {noSkillAgents.length > 0 && !query && <NoSkillAgentsList agents={noSkillAgents} />}
    </div>
  );
}
