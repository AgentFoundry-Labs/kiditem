'use client';

import {
  Cpu,
  FolderKanban,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  Wrench,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const STATUS_LABEL = {
  working: '집중 중',
  waiting: '대기 중',
  blocked: '승인 필요',
  idle: '준비됨',
  offline: '오프라인',
} satisfies Record<AgentOfficeNode['status'], string>;

export function AgentInspector({ node }: { node: AgentOfficeNode | null }) {
  if (!node) {
    return (
      <aside
        aria-label="직원 프로필"
        className="min-h-[360px] rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
          <SlidersHorizontal size={14} />
          <span>직원 프로필</span>
        </div>
        <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          직원을 선택하세요.
        </p>
      </aside>
    );
  }

  return (
    <aside
      aria-label="직원 프로필"
      className="max-h-[calc(100vh-140px)] overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-purple-600">직원 프로필</p>
          <h2 className="mt-1 truncate text-base font-semibold text-slate-900">
            {node.displayName}
          </h2>
          <p className="truncate text-xs text-slate-500">
            {node.name} · {node.agentType}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
          {STATUS_LABEL[node.status]}
        </span>
      </div>

      <div className="mt-4 space-y-3 text-xs">
        <div className="border-b border-slate-200 pb-3">
          <p className="text-slate-500">담당 업무</p>
          <p className="mt-1 leading-5 text-slate-700">{node.responsibility}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 pb-3">
          <div>
            <dt className="flex items-center gap-1 text-slate-500">
              <Cpu size={13} /> 모델
            </dt>
            <dd className="mt-1 truncate font-medium text-slate-900">
              {node.effectiveModel || '미지정'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">어댑터</dt>
            <dd className="mt-1 truncate font-medium text-slate-900">
              {node.adapterType || '미지정'}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-slate-500">
              <ShieldCheck size={13} /> 권한
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              신뢰 단계 {node.trustLevel}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-slate-500">
              <FolderKanban size={13} /> 작업 폴더
            </dt>
            <dd className="mt-1 truncate font-mono text-purple-600">
              agents/{node.agentType}
            </dd>
          </div>
        </dl>

        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <dt className="flex items-center gap-1 text-slate-500">
              <TimerReset size={13} /> 실행
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">
              {node.activeRunCount}
            </dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <dt className="flex items-center gap-1 text-slate-500">
              <ShieldCheck size={13} /> 승인
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">
              {node.pendingApprovalCount}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4 text-xs">
        <div className="flex items-center justify-between gap-2 text-slate-500">
          <span className="flex items-center gap-1">
            <Wrench size={13} />
            보유 능력
          </span>
          <span className="font-semibold text-slate-700">
            {node.capabilities.length}
          </span>
        </div>
        <div className="mt-3 divide-y divide-slate-100 border-y border-slate-200">
          {node.capabilities.length > 0 ? (
            node.capabilities.map((capability) => (
              <div key={capability.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-slate-900">
                    {capability.displayName}
                  </span>
                  <span className="shrink-0 text-[10px] text-purple-600">
                    {STATUS_LABEL[capability.status]}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                  {capability.responsibility}
                </p>
              </div>
            ))
          ) : (
            <p className="py-3 text-slate-500">등록된 능력 없음</p>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        마지막 활동 {node.lastActivityAt ? formatDateTime(node.lastActivityAt) : '없음'}
      </p>
    </aside>
  );
}
