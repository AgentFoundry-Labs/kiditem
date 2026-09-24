'use client';

import { memo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Database, Inbox, Maximize2, Minus, NotebookTabs, Plus, Send, ShoppingBag } from 'lucide-react';
import { channelLogoPath } from '@kiditem/shared/channel-registry';
import { mallMonogram } from '@/app/(channels)/_shared/mall-presentation';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import {
  DIAGRAM_AGENT_BY_ID,
  DIAGRAM_AGENT_GROUPS,
  DIAGRAM_EDGES,
  DIAGRAM_HEIGHT,
  DIAGRAM_IO_LABELS,
  DIAGRAM_NODES,
  DIAGRAM_TAB_HEIGHT,
  DIAGRAM_WIDTH,
  type DiagramAgentGroup,
  type DiagramAgentId,
  type DiagramExternalNode,
  type DiagramPanelNode,
  type DiagramStageNode,
  type DiagramTile,
} from '../lib/pipe-diagram-layout';
import { mergeStageViews, type PipeMallConnector, type PipeSnapshot, type PipeStageView } from '@/lib/agent-org/pipe-model';
import { PIPE_NO_DATA, type PipeState } from '@/lib/agent-org/pipe-states';
import { NO_CANVAS_INSETS, useCanvasView, type CanvasInsets } from '../hooks/use-canvas-view';
import type { PipeConfirmChannel } from '@/hooks/use-confirm-report';
import { BrandMark } from './BrandMark';
import { PipeStateChip } from './PipeStateChip';

/** 박스 테두리는 상태를 따른다. 모름은 점선이다 — 정상처럼 보이면 안 된다. */
const NODE_TONE: Readonly<Record<PipeState, string>> = {
  blocked_external: 'border-amber-400/60',
  failed: 'border-red-400/60',
  waiting_human: 'border-violet-400/60',
  retrying: 'border-dashed border-orange-400/55',
  stale: 'border-yellow-600/60',
  partial: 'border-teal-300/50',
  running: 'border-blue-400/60',
  queued: 'border-slate-400/35',
  unknown: 'border-dashed border-slate-600/80',
  rejected: 'border-rose-300/40',
  done: 'border-emerald-400/35',
  skipped: 'border-white/10',
};

const DOT_TONE: Readonly<Record<PipeState, string>> = {
  blocked_external: 'bg-amber-400',
  failed: 'bg-red-400',
  waiting_human: 'bg-violet-400',
  retrying: 'bg-orange-400',
  stale: 'bg-yellow-600',
  partial: 'bg-teal-300',
  running: 'bg-blue-400 motion-safe:animate-pulse',
  queued: 'bg-slate-400',
  unknown: 'bg-slate-600',
  rejected: 'bg-rose-300',
  done: 'bg-emerald-400',
  skipped: 'bg-slate-600',
};

const CONNECTOR_RING: Readonly<Record<PipeMallConnector['state'], string>> = {
  signed_in: 'ring-emerald-400/70',
  needs_login: 'ring-amber-400/80',
  unknown: 'ring-slate-600',
};

const MALL_LOGO_SLOTS = 21;

const CONNECTOR_ORDER: Readonly<Record<PipeMallConnector['state'], number>> = {
  needs_login: 0,
  unknown: 1,
  signed_in: 2,
};

/** 가로 · 세로로 꺾이는 선의 모서리를 둥글게. 원래 그림처럼 부드럽게 꺾인다. */
function roundedPath(points: readonly (readonly [number, number])[], radius = 12): string {
  if (points.length === 0) return '';
  const [sx, sy] = points[0]!;
  let d = `M ${sx} ${sy}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1]!;
    const [cx, cy] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    const inLength = Math.hypot(cx - px, cy - py);
    const outLength = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const ix = cx - ((cx - px) / inLength) * r;
    const iy = cy - ((cy - py) / inLength) * r;
    const ox = cx + ((nx - cx) / outLength) * r;
    const oy = cy + ((ny - cy) / outLength) * r;
    d += ` L ${ix} ${iy} Q ${cx} ${cy} ${ox} ${oy}`;
  }
  const [ex, ey] = points[points.length - 1]!;
  return `${d} L ${ex} ${ey}`;
}

function NodeTab({ label }: { label: string }) {
  return (
    <div className="relative flex items-end pb-1.5" style={{ height: DIAGRAM_TAB_HEIGHT }}>
      <span className="rounded-md border border-white/10 bg-[#1b2436] px-2 py-0.5 text-[13px] leading-5 text-slate-300">
        {label}
      </span>
    </div>
  );
}

/**
 * 에이전트 한 명이 맡은 박스를 감싸는 틀. 틀 색이 "누구 일인가"를 말하고, 안의 박스
 * 테두리 · 칩은 여전히 "지금 어떤가"를 말한다.
 */
function AgentGroupFrame({ group, selected }: { group: DiagramAgentGroup; selected: boolean }) {
  const Icon = group.icon;
  return (
    <div
      className={cn('absolute rounded-[26px] border transition-[border-color,box-shadow] duration-300', selected && 'border-2')}
      style={{
        left: group.x,
        top: group.y,
        width: group.w,
        height: group.h,
        borderColor: selected ? group.color : `${group.color}4d`,
        backgroundColor: selected ? `${group.color}14` : `${group.color}0a`,
        boxShadow: selected ? `0 0 0 6px ${group.color}1f, 0 0 48px ${group.color}33` : undefined,
      }}
    >
      <div
        className="absolute left-3.5 top-2.5 flex items-center gap-1.5 rounded-full border bg-[#0a0f1a] py-1 pl-2 pr-2.5"
        style={{ borderColor: `${group.color}66` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: group.color }} aria-hidden />
        <span className="text-[13px] font-semibold leading-none" style={{ color: group.color }}>
          {group.label}
        </span>
      </div>
    </div>
  );
}

/** 박스 안 기능 타일 — 바깥 서비스는 로고, 우리 기능은 아이콘. */
function TileMark({ tile }: { tile: DiagramTile }) {
  if (tile.brand) return <BrandMark brand={tile.brand} size={36} decorative className="ring-1 ring-inset ring-white/10" />;
  const Icon = tile.icon;
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#04070d]">
      <Icon className="h-4 w-4 text-slate-100" aria-hidden />
    </span>
  );
}

function StageNode({ node, view, now }: { node: DiagramStageNode; view: PipeStageView; now: number }) {
  const { def } = view;
  const agentColor = DIAGRAM_AGENT_BY_ID.get(node.agent)?.color;
  const metric =
    view.lastCount !== null
      ? `최근 ${formatNumber(view.lastCount)}건`
      : view.measurable
        ? view.lastAt !== null
          ? timeAgo(new Date(view.lastAt), new Date(now))
          : '기록 없음'
        : PIPE_NO_DATA;
  const line = view.reason ?? (view.lastAt !== null ? `마지막 활동 ${timeAgo(new Date(view.lastAt), new Date(now))}` : null);

  // 화면이 아직 없는 단계(릴스 · 블로그)는 누를 곳이 없다 — 링크 대신 준비 중 상자로 선다.
  const planned = def.href === null;
  const boxClass = cn(
    'flex flex-col rounded-2xl border bg-[#111827] p-3.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
    NODE_TONE[view.state],
    !planned && 'hover:bg-[#151e30]',
    def.gate && 'bg-violet-500/[0.07]',
  );
  const content = (
    <>
      <div className="flex gap-3">
        <div className="flex w-[74px] shrink-0 flex-col items-center gap-1.5">
          <div className="relative flex h-[60px] w-[60px] items-center justify-center rounded-xl border border-white/10 bg-[#1e293b]">
            {node.primary.brand ? (
              <BrandMark brand={node.primary.brand} size={40} decorative />
            ) : (
              <node.primary.icon className="h-7 w-7" style={{ color: agentColor }} aria-hidden />
            )}
            <span className={cn('absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[#111827]', DOT_TONE[view.state])} aria-hidden />
          </div>
          {/* 이름은 박스 위 이름표가 말한다. 아이콘 아래에는 이 박스가 하는 일을 적는다. */}
          <h3 className="break-keep text-center text-[12.5px] font-medium leading-tight text-slate-200">{node.primary.caption}</h3>
        </div>
        <ul className="grid flex-1 grid-cols-3 gap-1.5 pt-0.5">
          {node.tiles.map((tile) => (
            <li key={tile.caption} className="flex flex-col items-center gap-1">
              <TileMark tile={tile} />
              <span className="break-keep text-center text-[10.5px] leading-tight text-slate-400">{tile.caption}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <PipeStateChip state={view.state} label={planned && !view.measurable ? '준비 중' : undefined} />
          <span className={cn('ml-auto text-[11.5px] tabular-nums', view.lastCount !== null ? 'text-slate-200' : 'text-slate-500')}>
            {metric}
          </span>
        </div>
        {line ? (
          <p className="truncate text-[11.5px] text-slate-500" title={line}>
            {line}
          </p>
        ) : null}
      </div>
    </>
  );
  const name = `${def.no !== null ? `${def.no}단계 ` : ''}${def.title}`;

  return (
    <div className="absolute" style={{ left: node.x, top: node.y - DIAGRAM_TAB_HEIGHT, width: node.w }}>
      <NodeTab label={node.label} />
      {def.href ? (
        <Link href={def.href} aria-label={`${name} 열기`} className={boxClass} style={{ height: node.h }}>
          {content}
        </Link>
      ) : (
        <div role="group" aria-label={`${name} · 준비 중`} className={boxClass} style={{ height: node.h }}>
          {content}
        </div>
      )}
    </div>
  );
}

function ExternalFrame({
  node,
  children,
  label,
}: {
  node: DiagramExternalNode | DiagramPanelNode;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="absolute" style={{ left: node.x, top: node.y - DIAGRAM_TAB_HEIGHT, width: node.w }}>
      <NodeTab label={node.label} />
      <Link
        href={node.href}
        aria-label={label}
        className={cn(
          'flex flex-col gap-2.5 rounded-2xl border bg-[#0d1422] p-3.5 transition-colors hover:bg-[#121a2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
          node.kind === 'panel' ? 'border-dashed border-white/15' : 'border-white/[0.12]',
        )}
        style={{ height: node.h }}
      >
        {children}
      </Link>
    </div>
  );
}

function MallsNode({ node, snapshot }: { node: DiagramExternalNode; snapshot: PipeSnapshot }) {
  const { connectors } = snapshot;
  const malls = [...connectors.malls].sort(
    (a, b) => CONNECTOR_ORDER[a.state] - CONNECTOR_ORDER[b.state] || a.name.localeCompare(b.name, 'ko'),
  );
  // 7칸 × 3줄. 넘치면 마지막 칸이 나머지 수를 말한다.
  const hidden = malls.length > MALL_LOGO_SLOTS ? malls.length - (MALL_LOGO_SLOTS - 1) : 0;
  const shown = hidden > 0 ? malls.slice(0, MALL_LOGO_SLOTS - 1) : malls;
  return (
    <ExternalFrame node={node} label="쇼핑몰 연결 상태 열기">
      <div className="flex items-baseline gap-1.5">
        <ShoppingBag className="h-4 w-4 self-center text-slate-400" aria-hidden />
        <span className="text-[15px] font-semibold tabular-nums text-slate-100">
          {connectors.total === null ? PIPE_NO_DATA : `${formatNumber(connectors.total)}곳`}
        </span>
      </div>
      {connectors.total !== null ? (
        <>
          {/* 가로 · 세로 간격이 같게: 칸이 열 너비를 꽉 채우는 정사각형이고, 테두리는 칸 안쪽에 그린다. */}
          <ul className="grid grid-cols-7 gap-2" aria-label="몰별 로그인 상태">
            {shown.map((mall) => {
              const logo = channelLogoPath(mall.key);
              return (
                <li
                  key={mall.key}
                  title={`${mall.name} · ${mall.state === 'signed_in' ? '로그인됨' : mall.state === 'needs_login' ? '로그인 필요' : '확인 안 됨'}`}
                  className={cn(
                    'flex aspect-square items-center justify-center overflow-hidden rounded-md bg-[#1e293b] ring-[1.5px] ring-inset',
                    CONNECTOR_RING[mall.state],
                  )}
                >
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일
                    <img src={logo} alt="" className="h-[15px] w-[15px] object-contain" />
                  ) : (
                    <span className="text-[9px] font-bold text-slate-300">{mallMonogram(mall.name)}</span>
                  )}
                </li>
              );
            })}
            {hidden > 0 ? (
              <li
                className="flex aspect-square items-center justify-center rounded-md bg-white/[0.04] text-[10.5px] font-medium tabular-nums text-slate-400"
                title={`나머지 ${hidden}곳`}
              >
                +{hidden}
              </li>
            ) : null}
          </ul>
          <div className="mt-auto flex flex-wrap gap-1">
            <PipeStateChip state="done" label="정상" count={connectors.signedIn} />
            {connectors.needsLogin > 0 ? <PipeStateChip state="blocked_external" label="로그인" count={connectors.needsLogin} /> : null}
            {connectors.unknown > 0 ? <PipeStateChip state="unknown" label="모름" count={connectors.unknown} /> : null}
          </div>
        </>
      ) : null}
    </ExternalFrame>
  );
}

function SellpiaNode({ node, view, now }: { node: DiagramExternalNode; view: PipeStageView | undefined; now: number }) {
  return (
    <ExternalFrame node={node} label="셀피아 재고 열기">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#1e293b]">
          <Database className="h-6 w-6 text-cyan-300" aria-hidden />
        </span>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-slate-100">셀피아</span>
          <span className="text-[11px] text-slate-500">재고 · 주문 · 송장</span>
        </div>
      </div>
      {view ? (
        <div className="mt-auto flex flex-col gap-1.5">
          <PipeStateChip state={view.state} label={view.state === 'stale' ? '재고 오래됨' : undefined} className="self-start" />
          <span className="text-[11px] text-slate-500">
            마지막 확인 {view.lastDoneAt !== null ? timeAgo(new Date(view.lastDoneAt), new Date(now)) : '기록 없음'}
          </span>
        </div>
      ) : null}
    </ExternalFrame>
  );
}

/**
 * 사장님 컨펌 텔레그램 칸. 연결 단계(봇 → 채팅 → 답장 받기)를 순서대로 말하고, 다 이어졌으면
 * 최종 후보의 결정 수와 "지금 보고 보내기"를 둔다. 버튼이 있어 칸 전체를 링크로 감싸지 않는다.
 */
function TelegramNode({ node, confirm, now }: { node: DiagramExternalNode; confirm: PipeConfirmChannel | undefined; now: number }) {
  const status = confirm?.status ?? null;
  const candidates = status?.candidates ?? null;
  const ready = status !== null && status.configured && status.chatConfigured;
  const canSend = ready && !confirm?.sending && candidates !== null && candidates.pending > 0;

  let subtitle: string;
  let chip: { state: PipeState; label: string };
  if (!confirm || (status === null && !confirm.failed)) {
    subtitle = '연결 확인 중';
    chip = { state: 'unknown', label: '확인 중' };
  } else if (status === null) {
    subtitle = '상태를 불러오지 못했습니다';
    chip = { state: 'unknown', label: '모름' };
  } else if (!status.configured) {
    subtitle = '봇 연결 전';
    chip = { state: 'unknown', label: '연결 전' };
  } else if (!status.chatConfigured) {
    subtitle = status.botUsername ? `@${status.botUsername} · 채팅 설정 필요` : '채팅 설정 필요';
    chip = { state: 'blocked_external', label: '채팅 설정 필요' };
  } else {
    subtitle = status.botUsername ? `@${status.botUsername}` : '봇 연결됨';
    chip = status.listening ? { state: 'done', label: '답장 받는 중' } : { state: 'stale', label: '답장 받기 꺼짐' };
  }

  return (
    <div className="absolute" style={{ left: node.x, top: node.y - DIAGRAM_TAB_HEIGHT, width: node.w }}>
      <NodeTab label={node.label} />
      <section
        aria-label="텔레그램 컨펌 보고"
        className="flex flex-col gap-2 rounded-2xl border border-white/[0.12] bg-[#0d1422] p-3.5"
        style={{ height: node.h }}
      >
        <div className="flex items-center gap-2.5">
          <BrandMark brand="telegram" size={36} decorative className="ring-1 ring-inset ring-white/10" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[13.5px] font-semibold text-slate-100">텔레그램 보고</span>
            <span className="truncate text-[11px] text-slate-500" title={subtitle}>{subtitle}</span>
          </div>
          <PipeStateChip state={chip.state} label={chip.label} className="ml-auto shrink-0" />
        </div>

        {ready ? (
          <>
            <dl className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: '대기', value: candidates?.pending },
                { label: '승인', value: candidates?.approved },
                { label: '반려', value: candidates?.rejected },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg bg-white/[0.04] py-1">
                  <dt className="text-[10.5px] text-slate-500">{cell.label}</dt>
                  <dd className="text-[15px] font-semibold tabular-nums text-slate-100">
                    {cell.value === undefined ? '–' : formatNumber(cell.value)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="truncate text-[11px] text-slate-500">
              {status?.lastReport
                ? `마지막 보고 ${timeAgo(new Date(status.lastReport.sentAt), new Date(now))} · ${formatNumber(status.lastReport.itemCount)}개`
                : candidates
                  ? '이번에 켠 뒤 보낸 보고 없음'
                  : '최종 후보가 아직 없습니다'}
            </p>
            <button
              type="button"
              onClick={confirm?.send}
              disabled={!canSend}
              className="mt-auto flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#26A5E4] text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f95cf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-500"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              {confirm?.sending
                ? '보내는 중…'
                : candidates && candidates.pending === 0
                  ? '기다리는 후보 없음'
                  : '지금 보고 보내기'}
            </button>
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-1 text-[11px] leading-snug text-slate-400">
            {status && !status.configured ? (
              <>
                <span>서버 설정에 컨펌용 봇 토큰과 쓸 조직을 넣으면 켜집니다.</span>
                <code className="truncate rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                  SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN
                </code>
                <code className="truncate rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                  SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID
                </code>
              </>
            ) : status && !status.chatConfigured ? (
              <>
                <span>봇에게 /start 를 보내 채팅 ID를 받은 뒤 서버 설정에 넣어 주세요.</span>
                {status.setupChatId ? (
                  <span className="text-slate-200">
                    받은 채팅 ID <span className="font-mono tabular-nums">{status.setupChatId}</span>
                  </span>
                ) : null}
                <code className="truncate rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                  SOURCING_CONFIRM_TELEGRAM_CHAT_ID
                </code>
              </>
            ) : (
              <span>후보 리스트를 보내고 상품마다 ✅ 승인 · ❌ 반려 답장을 받습니다.</span>
            )}
            <Link
              href={node.href}
              className="mt-auto self-start text-[11px] text-sky-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              최종 선택 열기
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function OversightNode({ node, snapshot }: { node: DiagramPanelNode; snapshot: PipeSnapshot }) {
  const count = (state: PipeState) => snapshot.inbox.filter((item) => item.state === state).length;
  const rows: { state: PipeState; label: string }[] = [
    { state: 'waiting_human', label: '승인 · 제출 대기' },
    { state: 'blocked_external', label: '로그인 · 인증' },
    { state: 'failed', label: '실패' },
    { state: 'stale', label: '오래됨' },
  ];
  return (
    <ExternalFrame node={node} label="확인 필요 목록으로">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-violet-300" aria-hidden />
        <span className="text-[22px] font-semibold leading-none tabular-nums text-slate-100">{formatNumber(snapshot.inbox.length)}</span>
        <span className="text-[11.5px] text-slate-400">확인 필요</span>
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.state} className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-400">{row.label}</span>
            <span className={cn('tabular-nums', count(row.state) > 0 ? 'text-slate-100' : 'text-slate-600')}>{formatNumber(count(row.state))}</span>
          </li>
        ))}
      </ul>
    </ExternalFrame>
  );
}

function MemoryNode({ node, snapshot, connection }: { node: DiagramPanelNode; snapshot: PipeSnapshot; connection: string }) {
  const { sources } = snapshot;
  const rows = [
    { label: '열린 알림', value: sources.openAlerts },
    { label: '알림 기록', value: sources.alerts },
  ];
  return (
    <ExternalFrame node={node} label="알림 열기">
      <div className="flex items-center gap-2">
        <NotebookTabs className="h-4 w-4 text-slate-300" aria-hidden />
        <span className="text-[12px] text-slate-400">현재 알림이 여기에 모입니다</span>
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-400">{row.label}</span>
            <span className={cn('tabular-nums', row.value === null ? 'text-slate-600' : 'text-slate-100')}>
              {row.value === null ? PIPE_NO_DATA : `${formatNumber(row.value)}건`}
            </span>
          </li>
        ))}
      </ul>
      <span className={cn('mt-auto text-[11px]', connection === 'connected' ? 'text-emerald-400' : 'text-slate-500')}>
        {connection === 'connected' ? '● 알림 10초마다 확인' : '알림을 확인하지 못함'}
      </span>
    </ExternalFrame>
  );
}

/**
 * 캔버스 안에 그리는 것 전부 — 선 · 라벨 · 박스.
 *
 * `memo` 로 감싼다. 끌거나 확대할 때는 바깥 틀의 `transform` 만 바뀌고 이 안은 그대로라,
 * 움직일 때마다 박스 스무 개와 선을 다시 그리지 않는다. 판정이 새로 나오거나(`snapshot`)
 * 시계가 넘어갈 때만(`now`) 다시 그린다.
 */
const DiagramContent = memo(function DiagramContent({
  snapshot,
  connection,
  now,
  confirm,
  selectedAgent,
}: {
  snapshot: PipeSnapshot;
  connection: string;
  now: number;
  confirm: PipeConfirmChannel | undefined;
  selectedAgent: DiagramAgentId | null;
}) {
  const stageViews = new Map(snapshot.stages.map((view) => [view.def.id, view]));
  // 박스마다 담은 단계를 합친 상태. 선과 바깥 박스도 같은 값을 본다.
  const nodeViews = new Map<string, PipeStageView>();
  const viewByStage = new Map<string, PipeStageView>();
  for (const node of DIAGRAM_NODES) {
    if (node.kind !== 'stage') continue;
    const parts = node.stageIds
      .map((id) => stageViews.get(id))
      .filter((view): view is PipeStageView => view !== undefined);
    if (parts.length === 0) continue;
    const merged = mergeStageViews(parts as [PipeStageView, ...PipeStageView[]]);
    nodeViews.set(node.id, merged);
    for (const id of node.stageIds) viewByStage.set(id, merged);
  }

  const renderNode = (node: (typeof DIAGRAM_NODES)[number]) => {
    if (node.kind === 'stage') {
      const view = nodeViews.get(node.id);
      return view ? <StageNode node={node} view={view} now={now} /> : null;
    }
    if (node.kind === 'panel') {
      return node.id === 'oversight' ? (
        <OversightNode node={node} snapshot={snapshot} />
      ) : (
        <MemoryNode node={node} snapshot={snapshot} connection={connection} />
      );
    }
    if (node.id === 'telegram') return <TelegramNode node={node} confirm={confirm} now={now} />;
    if (node.id === 'marketplaces') return <MallsNode node={node} snapshot={snapshot} />;
    return <SellpiaNode node={node} view={viewByStage.get('inventory')} now={now} />;
  };

  return (
    <>
      {DIAGRAM_AGENT_GROUPS.map((group) => (
        <AgentGroupFrame key={`agent:${group.id}`} group={group} selected={group.id === selectedAgent} />
      ))}
      <svg className="absolute inset-0" width={DIAGRAM_WIDTH} height={DIAGRAM_HEIGHT} viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} aria-hidden>
        <defs>
          <marker id="pipe-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#64748b" />
          </marker>
        </defs>
        {DIAGRAM_EDGES.map((edge) => {
          const flowing = edge.to !== null && viewByStage.get(edge.to)?.state === 'running';
          return (
            <path
              key={edge.id}
              d={roundedPath(edge.points)}
              fill="none"
              stroke={flowing ? '#60a5fa' : '#475569'}
              strokeWidth={1.6}
              strokeDasharray={edge.dashed ? '5 5' : undefined}
              markerEnd={edge.arrow ? 'url(#pipe-arrow)' : undefined}
              markerStart={edge.twoWay ? 'url(#pipe-arrow)' : undefined}
              className={flowing ? 'pipe-flow' : undefined}
            />
          );
        })}
        {DIAGRAM_EDGES.filter((edge) => edge.label).map((edge) => (
          <text
            key={`${edge.id}-label`}
            x={edge.label!.x}
            y={edge.label!.y}
            fill="#94a3b8"
            fontSize={12}
            textAnchor="middle"
            stroke="#0a0f1a"
            strokeWidth={5}
            paintOrder="stroke"
          >
            {edge.label!.text}
          </text>
        ))}
      </svg>

      {DIAGRAM_IO_LABELS.map((io) => (
        <div
          key={io.id}
          className={cn('absolute flex flex-col', io.align === 'right' ? 'items-end text-right' : 'items-start text-left')}
          style={{ left: io.x, top: io.y, width: io.w }}
        >
          <span className="text-[15px] font-semibold text-slate-200">{io.lines[0]}</span>
          {io.lines.slice(1).map((line) => (
            <span key={line} className="text-[12px] text-slate-500">
              {line}
            </span>
          ))}
        </div>
      ))}

      {DIAGRAM_NODES.map((node) => {
        const dimmed = selectedAgent !== null && node.agent !== selectedAgent;
        return (
          <div key={`${node.kind}:${node.id}`} className={cn('transition-opacity duration-300', dimmed && 'opacity-40')}>
            {renderNode(node)}
          </div>
        );
      })}
    </>
  );
});

/**
 * Agent Org 다이어그램 — 한 장의 아키텍처 그림으로 소싱부터 CS 까지.
 *
 * 박스는 단계, 박스 안 타일은 그 단계의 기능, 선은 흐름이다. 박스의 테두리 · 점 · 칩이 지금
 * 상태를 말하고, 셀 곳이 없는 단계는 점선 테두리와 '데이터 없음'으로 선다. 진행 중인 단계로
 * 들어가는 선에만 흐름이 움직인다.
 */
export function PipeDiagram({
  snapshot,
  connection,
  now,
  confirm,
  insets = NO_CANVAS_INSETS,
  selectedAgent = null,
}: {
  snapshot: PipeSnapshot;
  connection: string;
  now: number;
  confirm?: PipeConfirmChannel;
  /** 캔버스 위에 떠 있는 패널이 가리는 폭. 그림은 그 안쪽 빈자리에 맞춘다. */
  insets?: CanvasInsets;
  /** 고른 에이전트. 그 묶음을 크게 당겨 보고, 나머지는 흐리게 둔다. */
  selectedAgent?: DiagramAgentId | null;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvas = useCanvasView(viewportRef, { width: DIAGRAM_WIDTH, height: DIAGRAM_HEIGHT }, insets);
  const { view, focus, fit } = canvas;
  const dot = 22 * view.scale;

  // 에이전트를 고르면 그 묶음으로, 고르기를 풀면 전체로 돌아간다. 처음 그릴 때는 건드리지 않는다.
  const previousAgent = useRef<DiagramAgentId | null>(selectedAgent);
  useEffect(() => {
    if (previousAgent.current === selectedAgent) return;
    previousAgent.current = selectedAgent;
    const group = selectedAgent ? DIAGRAM_AGENT_GROUPS.find((candidate) => candidate.id === selectedAgent) : undefined;
    if (group) focus(group);
    else fit();
  }, [selectedAgent, focus, fit]);

  return (
    <section aria-label="Agent Org 파이프라인" className="absolute inset-0 overflow-hidden">
      <style>{`@keyframes pipe-flow{to{stroke-dashoffset:-24}}.pipe-flow{stroke-dasharray:7 5;animation:pipe-flow 1.2s linear infinite}@media (prefers-reduced-motion:reduce){.pipe-flow{animation:none}}`}</style>
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-roledescription="캔버스"
        aria-label="파이프라인 캔버스. 끌어서 옮기고, 더하기 빼기 키로 확대 축소, 0 키로 화면에 맞춥니다."
        {...canvas.handlers}
        className={cn(
          'absolute inset-0 touch-none select-none overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-400',
          canvas.dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.1) 1px, transparent 1px)',
          backgroundSize: `${dot}px ${dot}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: DIAGRAM_WIDTH,
            height: DIAGRAM_HEIGHT,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
            willChange: canvas.dragging ? 'transform' : undefined,
          }}
        >
          <DiagramContent snapshot={snapshot} connection={connection} now={now} confirm={confirm} selectedAgent={selectedAgent} />
        </div>
      </div>

      {/* 양옆은 패널 자리라, 크기 조절은 아래 가운데에 둔다. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div
          className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#0f1628]/95 p-1 shadow-xl shadow-black/40 backdrop-blur-xl"
          role="toolbar"
          aria-label="캔버스 크기"
        >
          <span className="hidden px-2 text-[11px] text-slate-500 lg:inline">끌어서 이동 · ⌘/Ctrl + 스크롤 확대</span>
          <span className="mx-0.5 hidden h-4 w-px bg-white/10 lg:inline" aria-hidden />
          <button
            type="button"
            onClick={canvas.zoomOut}
            aria-label="축소"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={canvas.actualSize}
            aria-label="원래 크기로"
            title="원래 크기로"
            className="h-8 min-w-[52px] rounded-lg px-1.5 font-mono text-[12px] tabular-nums text-slate-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {Math.round(view.scale * 100)}%
          </button>
          <button
            type="button"
            onClick={canvas.zoomIn}
            aria-label="확대"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
          <button
            type="button"
            onClick={canvas.fit}
            aria-label="화면에 맞춤"
            title="화면에 맞춤"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
