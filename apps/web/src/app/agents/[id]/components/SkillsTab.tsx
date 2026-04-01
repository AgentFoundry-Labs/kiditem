'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SKILL_DESCRIPTIONS } from '@/lib/agent-types';
import type { Agent } from '@/lib/agent-types';

export function SkillsTab({ agent }: { agent: Agent }) {
  const skills = agent.skills ?? [];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">에이전트 스킬</h3>
          <p className="text-xs text-gray-500 mt-0.5">이 에이전트에 할당된 스킬 목록입니다.</p>
        </div>
        <Link href="/agents/skills" className="text-xs text-blue-600 hover:text-blue-800 transition-colors">
          스킬 라이브러리 보기 →
        </Link>
      </div>

      {skills.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">등록된 스킬이 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">에이전트 설정에서 스킬을 추가할 수 있습니다.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {skills.map((skill, index) => (
            <div
              key={skill}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                index < skills.length - 1 && 'border-b border-gray-100',
              )}
            >
              <div className="w-3.5 h-3.5 rounded border-2 border-gray-300 bg-white flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-sm bg-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 font-mono">{skill}</span>
                {SKILL_DESCRIPTIONS[skill] && (
                  <p className="text-xs text-gray-500 mt-0.5">{SKILL_DESCRIPTIONS[skill]}</p>
                )}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                활성
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Skill management info */}
      <div className="border border-gray-100 rounded-lg p-4 bg-gray-50">
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">스킬 관리:</span> 스킬은{' '}
          <code className="font-mono text-gray-700 bg-white px-1 rounded border border-gray-200">agent-config/skills/</code>{' '}
          디렉토리에서 심링크로 주입됩니다.
        </p>
      </div>
    </div>
  );
}
