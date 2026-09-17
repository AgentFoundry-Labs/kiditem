'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Circle,
  CircleDot,
  Database,
  Radar,
  RotateCcw,
  Target,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  PIPELINE_ITEM_LABEL,
  type PipelineItem,
  type PipelineStage,
  type PipelineStageKey,
} from '../lib/agent-pipeline';
import type { MallAgentMission, MissionStatus } from '../lib/mall-agent-missions';

const STAGE_ICON: Record<PipelineStageKey, typeof Target> = {
  mission: Target,
  sense: Radar,
  decide: BrainCircuit,
  act: Wrench,
  approve: UserCheck,
  remember: Database,
};

/**
 * 단계 색. 대시보드 Agent OS 보드와 같은 방식으로 쓴다 — 색은 칸 머리(아이콘 · 이름)와 줄
 * 왼쪽 점 · 오른쪽 버튼에만 있다. 칸 몸통과 줄은 흰색이고, 됨 · 일부 · 아직은 상태 칩과
 * 점선 테두리가 말한다.
 */
const STAGE_COLOR: Record<PipelineStageKey, string> = {
  mission: '#8b5cf6',
  sense: '#0ea5e9',
  decide: '#14b8a6',
  act: '#f59e0b',
  approve: '#f43f5e',
  remember: '#64748b',
};

const MISSION_LABEL: Record<MissionStatus, string> = { done: '됨', progress: '진행 중', todo: '아직' };

const TONE: Record<MissionStatus, { chip: string; dot: string; Icon: typeof Circle }> = {
  done: { chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', Icon: CheckCircle2 },
  progress: { chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', Icon: CircleDot },
  todo: { chip: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300', Icon: Circle },
};

/**
 * 줄 하나의 모양 — 미션이든 단계의 일이든 똑같다.
 *
 *   [점] [제목 한 줄] [상태 칩] [바로가기]
 *        [설명 두 줄 고정]
 *
 * 제목은 한 줄로 자르고 설명 칸은 두 줄 높이(`h-8`)로 고정한다. 그래서 글 길이가 달라도
 * 모든 줄의 높이가 같다. 바로가기가 없는 줄도 같은 자리를 비워 둬 오른쪽 끝이 맞는다.
 */
const ROW = 'overflow-hidden rounded-lg border bg-white';
const ROW_BODY = 'px-2.5 py-2';
const ROW_TITLE = 'min-w-0 flex-1 truncate text-xs font-semibold leading-4 text-slate-900';
const ROW_DETAIL = 'mt-1 line-clamp-2 h-8 pl-3 text-[11px] leading-4 text-slate-500';

function rowBorder(status: MissionStatus): string {
  return status === 'todo' ? 'border-dashed border-slate-200' : 'border-slate-100';
}

/**
 * 에이전트 파이프라인 — 대시보드 Agent OS 보드와 같은 모양.
 *
 * 맨 위에 에이전트가 서고 선이 내려와 단계 여섯 칸으로 갈라진다. 칸은 한 화면에 다 들어가고
 * (가로 스크롤 없음), 색은 칸 머리와 줄의 점 · 버튼에만 있다. 칸마다 머리 아래로 줄이 바로
 * 붙어 폭과 여백이 같고, 줄은 모두 같은 높이다. 미션 줄만 눌러서 펼치면 목표 · 지금 · 다음이
 * 나온다.
 */
export function AgentPipeline({
  stages,
  missions,
}: {
  stages: readonly PipelineStage[];
  missions: readonly MallAgentMission[];
}) {
  const decide = stages.find((stage) => stage.key === 'decide');
  const remember = stages.find((stage) => stage.key === 'remember');
  const loopNote =
    decide?.status === 'todo'
      ? '판단이 아직이라 이 고리는 열려 있다.'
      : remember?.status !== 'done'
        ? '기억이 아직 다 쌓이지 않아 고리가 덜 닫혔다.'
        : '이 고리가 이어져 있다.';

  return (
    <section id="mall-pipeline" aria-labelledby="mall-agent-pipeline-title" className="card scroll-mt-6 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Target size={16} aria-hidden />
          </span>
          <h2 id="mall-agent-pipeline-title" className="section-title text-base">
            에이전트 파이프라인
          </h2>
          <span className="text-xs font-normal text-slate-400">
            일이 흐르는 순서 · 단계마다 아래가 그 단계의 일
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary">사장님 미션</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">에이전트 제안</span>
          <span className="text-slate-400">상태는 지금 코드가 실제로 하는 일 기준</span>
        </div>
      </div>

      {/* 대시보드 Agent OS 보드와 같은 바탕 — 옅은 보라에서 흰색으로. */}
      <div
        className="relative mt-4 overflow-hidden rounded-2xl border border-violet-100 p-4"
        style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 45%, #eff6ff 100%)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 20% 0%, rgba(139,92,246,0.08) 0%, transparent 40%), radial-gradient(circle at 80% 100%, rgba(59,130,246,0.06) 0%, transparent 40%)',
          }}
        />
        <div className="relative">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white">
              <Bot size={14} aria-hidden />
              쇼핑몰 에이전트
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-white/40" aria-hidden />
            </span>
          </div>
          <div className="flex justify-center">
            <span aria-hidden style={{ width: 1.5, height: 10, background: '#7c3aed', opacity: 0.3 }} />
          </div>

          <ol aria-label="에이전트 파이프라인" className="grid grid-cols-6 gap-2">
            {stages.map((stage, index) => {
              const color = STAGE_COLOR[stage.key];
              const count = stage.key === 'mission' ? missions.length : stage.items.length;
              return (
                <li
                  key={stage.key}
                  data-stage={stage.key}
                  aria-label={`${index + 1}단계 ${stage.name}`}
                  className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <StageHeader stage={stage} color={color} count={count} />
                  <ul className="flex flex-1 flex-col gap-1.5 p-2">
                    {stage.key === 'mission'
                      ? missions.map((mission) => (
                          <MissionItem key={mission.id} mission={mission} color={color} />
                        ))
                      : stage.items.map((item) => <StageItem key={item.id} item={item} color={color} />)}
                  </ul>
                  {stage.note ? (
                    <p className="border-t border-slate-100 px-2.5 py-2 text-[11px] leading-4 text-slate-500">
                      {stage.note}
                    </p>
                  ) : null}
                  <span data-connector aria-hidden className="hidden" />
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <RotateCcw size={13} className="flex-none text-slate-400" aria-hidden />
        기억은 다음 판단으로 돌아가 에이전트를 나아지게 한다 — {loopNote}
      </p>
    </section>
  );
}

function StatusChip({ status, label }: { status: MissionStatus; label: string }) {
  const tone = TONE[status];
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        tone.chip,
      )}
    >
      <tone.Icon size={10} aria-hidden />
      {label}
    </span>
  );
}

/** 칸 머리 — 여기에만 단계 색이 있다. 아이콘 · 이름 · 개수, 그 아래 상태와 물음. 번호는 없다. */
function StageHeader({
  stage,
  color,
  count,
}: {
  stage: PipelineStage;
  color: string;
  count: number;
}) {
  const Icon = STAGE_ICON[stage.key];
  return (
    <div className="flex-none border-b border-slate-100 px-2.5 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full"
          style={{ background: `${color}14`, color }}
        >
          <Icon size={17} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span data-stage-name className="truncate text-sm font-bold" style={{ color }}>
              {stage.name}
            </span>
            <span className="flex-none rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold tabular-nums text-slate-500">
              {formatNumber(count)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 flex-none rounded-full', TONE[stage.status].dot)} aria-hidden />
            <span className="truncate text-[11px] text-slate-400">{stage.question}</span>
          </span>
        </span>
        <StatusChip status={stage.status} label={PIPELINE_ITEM_LABEL[stage.status]} />
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium tabular-nums text-slate-500">{stage.tally}</p>
    </div>
  );
}

/** 줄 오른쪽 자리 — 갈 곳이 있으면 버튼, 없으면 같은 크기의 빈자리로 끝을 맞춘다. */
function RowAction({
  href,
  label,
  color,
}: {
  href?: { path: string; label: string };
  label?: string;
  color: string;
}) {
  if (!href) return <span aria-hidden className="h-6 w-6 flex-none" />;
  return (
    <Link
      href={href.path}
      aria-label={label ?? href.label}
      title={label ?? href.label}
      className="flex h-6 w-6 flex-none items-center justify-center rounded-md transition hover:brightness-95"
      style={{ background: `${color}15`, color }}
    >
      <ArrowRight size={12} aria-hidden />
    </Link>
  );
}

function StageItem({ item, color }: { item: PipelineItem; color: string }) {
  return (
    <li className={cn(ROW, ROW_BODY, rowBorder(item.status))}>
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} />
        <span className={ROW_TITLE} title={item.title}>
          {item.title}
        </span>
        <StatusChip status={item.status} label={PIPELINE_ITEM_LABEL[item.status]} />
        <RowAction href={item.href ?? undefined} color={color} />
      </div>
      <p className={ROW_DETAIL} title={item.detail}>
        {item.detail}
      </p>
    </li>
  );
}

/**
 * 미션 한 줄 — 닫혀 있을 때는 다른 줄과 똑같은 모양이고, 누르면 목표 · 지금 · 다음이 펼쳐진다.
 * 번호는 붙이지 않는다.
 */
function MissionItem({ mission, color }: { mission: MallAgentMission; color: string }) {
  return (
    <li aria-label={`미션 ${mission.title}`} className={cn(ROW, rowBorder(mission.status))}>
      <details className="group">
        <summary className={cn(ROW_BODY, 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} />
            <span className={ROW_TITLE} title={mission.title}>
              {mission.title}
            </span>
            <StatusChip status={mission.status} label={MISSION_LABEL[mission.status]} />
            <RowAction href={mission.href} color={color} />
          </span>
          <span className={ROW_DETAIL} title={mission.goal}>
            <span
              className={cn(
                'mr-1 rounded-full px-1.5 text-[10px] font-medium',
                mission.origin === 'owner' ? 'bg-primary-soft text-primary' : 'bg-slate-100 text-slate-600',
              )}
            >
              {mission.origin === 'owner' ? '사장님 미션' : '에이전트 제안'}
            </span>
            {mission.goal}
          </span>
        </summary>
        <dl className="space-y-1 border-t border-slate-100 px-2.5 py-2 text-[11px] leading-4">
          <div className="flex gap-1.5">
            <dt className="w-7 flex-none font-semibold text-slate-500">지금</dt>
            <dd className="text-slate-700">{mission.now}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-7 flex-none font-semibold text-slate-500">다음</dt>
            <dd className="text-slate-700">{mission.next}</dd>
          </div>
        </dl>
      </details>
    </li>
  );
}
