'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpFromLine,
  ExternalLink,
  Loader2,
  PackageX,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { listingStatePill } from '../../_shared/mall-presentation';
import { ListingAvailabilityExecutionHistory } from '../../_shared/ListingAvailabilityExecutionHistory';
import { executeListingAvailability } from '../../_shared/listing-availability-execution';
import { listingAvailabilityExecutionKeys } from '../../_shared/listing-availability-execution-api';
import {
  mallSoldOutNote,
  canReadMallAvailability,
  canSendMallAvailability,
  sendMallAvailability,
  type MallLiveSummary,
} from '../../_shared/mall-availability-send';
import { showAvailabilityWarnings } from '../../_shared/MallAvailabilitySend';
import type { MallLiveCell } from '../hooks/use-mall-live-availability';
import type { MallListingMatrixColumn, MallListingState } from '@kiditem/shared/mall-publishing';

/**
 * 액션 메뉴. 가능 여부는 목록의 채널 기능이 정하고, 품절·재개는 서버 실행 원장을
 * 거쳐 기존 확장 전송 경로로 보낸다. 다른 액션은 각자의 연결 상태를 그대로 표시한다.
 */

const NOT_WIRED = '아직 실행 경로가 연결되지 않았습니다.';

/**
 * 표는 `overflow-x-auto` 안에 있다. 그 안에서 `position:absolute` 로 띄우면
 * 컨테이너 경계에서 잘린다 — 아래쪽 행이나 오른쪽 끝 열에서 메뉴 절반이 사라진다.
 * 그래서 화면 좌표로 고정하고, 화면 밖으로 나가면 반대쪽으로 접는다.
 */
function anchoredStyle(rect: DOMRect, width: number): React.CSSProperties {
  const margin = 8;
  const left = Math.min(
    Math.max(margin, rect.right - width),
    (typeof window === 'undefined' ? width + margin * 2 : window.innerWidth) - width - margin,
  );
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const openUpward = viewportHeight > 0 && rect.bottom + 280 > viewportHeight;
  return openUpward
    ? { position: 'fixed', left, bottom: viewportHeight - rect.top + 4, width }
    : { position: 'fixed', left, top: rect.bottom + 4, width };
}

/**
 * 메뉴를 페이지 맨 위층에 띄운다.
 *
 * 화면 좌표(`fixed`)로 띄워도 그리는 자리가 왼쪽 고정 칸(`sticky` + `z-10`) 안이면 그 칸이
 * 만든 층에 갇힌다. 그러면 아래 줄의 고정 칸이 메뉴 위를 덮어 첫 줄만 보이고 나머지가
 * 사라진다(라이브 2026-09-18). body 에 그리면 `z-40` 이 페이지 전체에서 통한다.
 */
function FloatingLayer({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

/**
 * 누른 버튼에 계속 붙어 있게 한다.
 *
 * 열 때의 좌표를 한 번 재고 끝내면, 표를 가로로 밀거나 페이지를 세로로 굴리는 순간
 * 메뉴만 제자리에 남아 누른 버튼과 어긋난다. 이 표는 몰이 스무 곳 넘어 **연 채로
 * 스크롤하는 것이 예외가 아니라 기본**이라, 움직일 때마다 다시 잰다.
 */
function useAnchoredStyle(anchor: HTMLElement, width: number): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>(() =>
    anchoredStyle(anchor.getBoundingClientRect(), width),
  );

  useLayoutEffect(() => {
    const place = () => setStyle(anchoredStyle(anchor.getBoundingClientRect(), width));
    place();
    // capture 로 들어야 표 안쪽(overflow-x-auto) 스크롤까지 잡힌다. 그 스크롤은
    // window 까지 올라오지 않는다.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, width]);

  return style;
}

interface ActionSpec {
  key: string;
  label: string;
  icon: typeof PackageX;
  available: boolean;
  /** 못 하는 이유. 가능하면 null. */
  reason: string | null;
  danger?: boolean;
  /**
   * 지금 이 칸에서 눌러 실행할 수 있는가.
   *
   * `available` 과 다르다 — 그건 "몰이 이 일을 지원하는가"(매니페스트)이고, 이건
   * "우리에게 보낼 길이 있는가"다. 둘을 하나로 합치면 지원하는데 길이 없는 몰의
   * 메뉴가 눌리는 것처럼 보인다.
   */
  run?: 'soldOut' | 'resume';
}

/** 한 몰에서 가능한 일. 매니페스트가 유일한 근거다. */
export function mallActionSpecs(column: MallListingMatrixColumn): ActionSpec[] {
  const { actions } = column;
  return [
    {
      key: 'create',
      label: '이 몰에 등록',
      icon: ArrowUpFromLine,
      available: actions.createListing,
      reason: actions.createListing ? null : '이 몰은 상품 등록 경로가 없습니다.',
    },
    {
      key: 'update',
      label: '수정 재전송',
      icon: RefreshCw,
      available: actions.updateListing,
      reason: actions.updateListing ? null : '이 몰은 수정 전송을 지원하지 않습니다.',
    },
    {
      key: 'soldout',
      label: actions.soldOutDeletesListing ? '품절 처리 (삭제됨)' : '품절 처리',
      icon: actions.soldOutDeletesListing ? Trash2 : PackageX,
      available: actions.soldOut,
      reason: actions.soldOut ? null : '이 몰은 품절 송신을 지원하지 않습니다.',
      danger: actions.soldOutDeletesListing,
      // 삭제되는 몰에서는 칸에서 바로 누르게 두지 않는다. 되돌릴 수 없는 일에
      // 한 번 누르면 끝나는 길을 만들지 않는다.
      ...(actions.soldOut && !actions.soldOutDeletesListing && canSendMallAvailability(column.mallKey)
        ? { run: 'soldOut' as const }
        : {}),
    },
    {
      key: 'resume',
      label: '판매 재개',
      icon: PlayCircle,
      available: actions.resume,
      reason: actions.resume ? null : '이 몰은 재개 경로가 확인되지 않았습니다.',
      ...(actions.resume && canSendMallAvailability(column.mallKey)
        ? { run: 'resume' as const }
        : {}),
    },
    {
      key: 'stock',
      label: '재고 동기화',
      icon: RefreshCw,
      available: actions.setStock,
      reason: actions.setStock ? null : '이 몰은 재고 쓰기를 지원하지 않습니다.',
    },
  ];
}

interface CellActionPopoverProps {
  column: MallListingMatrixColumn;
  productName: string;
  state: MallListingState;
  rawStatus: string | null;
  externalId: string | null;
  /** 몰 매장의 상품 페이지(확인한 규칙이 있는 몰만). 있으면 "몰에서 보기"로 연다. */
  productUrl?: string | null;
  /** 몰 지금 재고(쿠팡 윙). 표가 페이지째 읽어 들고 있고, 창과 칸이 같은 값을 본다. */
  live?: MallLiveCell | null;
  /** 이 칸을 몰에서 다시 읽는다. */
  onRefreshLive?: () => Promise<void>;
  /** 이 메뉴를 연 버튼. 스크롤해도 계속 그 버튼에 붙어 있게 한다. */
  anchor: HTMLElement;
  onClose: () => void;
}

const LIVE_TONE: Record<MallLiveSummary['tone'], string> = {
  sold_out: 'bg-rose-50 text-rose-700',
  partial: 'bg-amber-50 text-amber-800',
  blocked: 'bg-orange-50 text-orange-700',
  pending: 'bg-sky-50 text-sky-700',
  ended: 'bg-slate-100 text-slate-600',
  on_sale: 'bg-emerald-50 text-emerald-700',
  rocket: 'bg-slate-50 text-slate-600',
};

/** 몰 지금 재고 한 줄. 판매상태(ON_SALE)와 따로 — 품절은 재고 0 이다. */
function LiveAvailabilityLine({
  mallName,
  live,
  onRetry,
}: {
  mallName: string;
  live: MallLiveCell;
  onRetry: () => void;
}) {
  if (live.status === 'loading') {
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
        <Loader2 size={10} className="animate-spin" />
        {mallName}에서 지금 재고 읽는 중
      </div>
    );
  }
  if (live.status === 'error') {
    return (
      <div className="mt-1.5 flex items-start gap-1 text-[10px] leading-relaxed text-slate-500">
        <span className="flex-1">지금 재고를 읽지 못했습니다 — {live.message}</span>
        <button type="button" onClick={onRetry} className="flex-none text-slate-600 underline underline-offset-2">
          다시
        </button>
      </div>
    );
  }
  const time = live.readAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (
    <div className={cn('mt-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium', LIVE_TONE[live.summary.tone])}>
      <span className="flex-1">지금 {live.summary.label}</span>
      <span className="flex-none font-normal opacity-70 tabular-nums">{time} 확인</span>
    </div>
  );
}

/** 칸 하나를 눌렀을 때. 그 (상품 × 몰) 에서 무엇이 가능한지 보여준다. */
export function CellActionPopover({
  column,
  productName,
  state,
  rawStatus,
  externalId,
  productUrl = null,
  live = null,
  onRefreshLive,
  anchor,
  onClose,
}: CellActionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const cellStyle = useAnchoredStyle(anchor, 256);
  const specs = mallActionSpecs(column);
  // 표 칸과 같은 말 · 같은 색(가져온 원문이 아는 말이면 그 말로).
  const presentation = listingStatePill(state, rawStatus);
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);
  const runLock = useRef(false);

  /**
   * 몰 지금 재고(쿠팡 윙). 가져온 판매상태(ON_SALE)는 품절이어도 판매중이라, 표가 페이지째 윙에서 읽어 둔 값을
   * 보인다. 표가 읽지 않은 칸(판매중이 아닌 칸)은 창을 열 때 이 칸만 읽는다. 읽기만 한다.
   */
  const liveReadable = canReadMallAvailability(column.mallKey) && Boolean(externalId) && Boolean(onRefreshLive);
  const readLive = useCallback(() => {
    if (liveReadable) void onRefreshLive?.();
  }, [liveReadable, onRefreshLive]);
  const askedOnOpen = useRef(false);
  useEffect(() => {
    if (askedOnOpen.current || !liveReadable || live) return;
    askedOnOpen.current = true;
    readLive();
  }, [live, liveReadable, readLive]);

  /**
   * 이 칸 하나를 몰에 보낸다.
   *
   * 칸이 곧 (상품 × 몰)이라 보낼 단위가 그대로 여기 있다. 몰 상품코드가 없으면
   * 어느 줄인지 짚을 수 없으므로 아예 누르지 못하게 둔다.
   */
  const run = async (spec: ActionSpec) => {
    if (runLock.current || !spec.run || !externalId || !canSendMallAvailability(column.mallKey)) return;
    if (!column.channelAccountId) {
      toast.error('몰 계정 식별자를 확인할 수 없어 품절·재개를 실행하지 않았습니다.');
      return;
    }
    runLock.current = true;
    const resume = spec.run === 'resume';
    setRunning(spec.key);
    try {
      const run = await executeListingAvailability({
        channelAccountId: column.channelAccountId,
        externalListingId: externalId,
        mallKey: column.mallKey,
        kind: resume ? 'resume' : 'sold_out',
        send: (snapshot, executionContext) => {
          if (!canSendMallAvailability(snapshot.mallKey)) {
            throw new Error(`${column.mallName}의 품절·재개 전송 경로가 없습니다.`);
          }
          return sendMallAvailability(snapshot.mallKey, [snapshot.externalListingId], {
            resume: snapshot.kind === 'resume',
            show: true,
            ...(snapshot.optionCodes.length > 0
              ? { optionCodes: { [snapshot.externalListingId]: snapshot.optionCodes } }
              : {}),
            executionContext,
          });
        },
      });
      if (run.transportResult) showAvailabilityWarnings(run.transportResult.warnings);
      if (!run.adapterCalled) {
        toast.warning(`${column.mallName} 상품에 진행 중인 ${resume ? '재개' : '품절'} 실행이 있습니다. 다시 보내지 않았습니다.`, {
          description: '아래 실행 이력에서 현재 상태를 확인하세요.',
          duration: 10_000,
        });
      } else if (run.transportError) {
        toast.warning(`${column.mallName} 전송 결과를 확인할 수 없습니다. 다시 보내지 않았습니다.`, {
          description: run.transportError,
          duration: 10_000,
        });
      } else if (run.transportResult?.requestOnly) {
        toast.warning(`${column.mallName} 관리자 승인 요청을 보냈습니다. 승인과 실제 계정을 확인해야 합니다.`, { duration: 10_000 });
      } else {
        toast.warning(`${column.mallName} ${run.transportResult?.sent ?? 0}건을 전송 시도했습니다. 실제 몰 계정과 상태를 확인해 기록하세요.`, { duration: 10_000 });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.mallPublishing.all });
      void queryClient.invalidateQueries({
        queryKey: listingAvailabilityExecutionKeys.history(column.channelAccountId, externalId),
      });
      if (run.adapterCalled && liveReadable) readLive();
    } catch (error) {
      // 보내지 못한 것도 관찰 기록에 남긴다(일괄 화면과 같게).
      toast.error(error instanceof Error ? error.message : '보내지 못했습니다.');
    } finally {
      runLock.current = false;
      setRunning(null);
    }
  };

  return (
    <FloatingLayer>
      <div
        ref={ref}
        role="dialog"
        aria-label={`${column.mallName} 작업`}
        style={cellStyle}
        className="z-40 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg"
      >
        <div className="border-b border-slate-100 pb-2">
          <div className="text-xs font-semibold text-slate-900">{column.mallName}</div>
          <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{productName}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', presentation.tone)}
            >
              {presentation.label}
            </span>
            {rawStatus ? (
              <span className="text-[10px] text-slate-400">몰 상태 {rawStatus}</span>
            ) : null}
          </div>
          {liveReadable && live ? <LiveAvailabilityLine mallName={column.mallName} live={live} onRetry={readLive} /> : null}
        </div>

        <ul className="mt-2 space-y-0.5">
          {specs.map((spec) => {
            // 몰이 지원하고(available) 우리에게 길이 있고(run) 이 몰에서 이 상품을
            // 부르는 코드까지 있어야(externalId) 누를 수 있다. 셋 중 하나라도 없으면
            // 왜 못 누르는지 title 이 말한다.
            const runnable = Boolean(spec.run) && spec.available && Boolean(externalId) && Boolean(column.channelAccountId);
            const busy = running === spec.key;
            return (
              <li key={spec.key}>
                <button
                  type="button"
                  disabled={!runnable || running !== null}
                  onClick={runnable ? () => void run(spec) : undefined}
                  title={
                    spec.reason
                    ?? (spec.run && !externalId ? '이 몰의 상품코드를 아직 모릅니다. 먼저 이 몰의 리스팅을 가져오세요.' : null)
                    ?? (spec.run && !column.channelAccountId ? '이 몰 계정 식별자가 없어 실행 원장을 열 수 없습니다.' : null)
                    ?? (runnable ? spec.label : NOT_WIRED)
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                    runnable
                      ? 'cursor-pointer bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:cursor-wait'
                      : 'cursor-not-allowed',
                    !runnable && spec.available && 'bg-slate-50 text-slate-700',
                    !runnable && !spec.available && 'text-slate-400 line-through decoration-slate-300',
                    spec.danger && spec.available && 'bg-red-50 text-red-700',
                  )}
                >
                  {busy ? (
                    <Loader2 size={12} className="flex-none animate-spin" />
                  ) : (
                    <spec.icon size={12} className="flex-none" />
                  )}
                  <span className="flex-1 truncate no-underline">{spec.label}</span>
                  {runnable ? null : spec.available ? (
                    <span className="flex-none rounded bg-white px-1 text-[9px] font-medium text-slate-500">
                      미연결
                    </span>
                  ) : (
                    <span className="flex-none text-[9px] text-slate-400">불가</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {externalId && (
          <ListingAvailabilityExecutionHistory
            channelAccountId={column.channelAccountId}
            externalListingId={externalId}
          />
        )}

        {column.actions.soldOutDeletesListing ? (
          <p className="mt-2 flex items-start gap-1 rounded-md bg-red-50 px-2 py-1.5 text-[10px] leading-relaxed text-red-700">
            <ShieldAlert size={11} className="mt-0.5 flex-none" />
            이 몰은 완전품절이 리스팅 삭제입니다. 되돌릴 수 없습니다.
          </p>
        ) : null}
        {column.actions.requiresOperatorApproval ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800">
            등록이 아니라 승인 신청입니다. 사람이 몰 화면에서 제출해야 합니다.
          </p>
        ) : null}

        {mallSoldOutNote(column.mallKey) && column.actions.soldOut ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800">
            {mallSoldOutNote(column.mallKey)}
          </p>
        ) : null}

        {externalId ? (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
            <span className="truncate">몰 상품번호 {externalId}</span>
            {productUrl ? (
              <a
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-none items-center gap-0.5 font-medium text-indigo-600 hover:underline"
              >
                몰에서 보기
                <ExternalLink size={10} />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </FloatingLayer>
  );
}

interface RowActionMenuProps {
  masterProductId: string;
  columns: MallListingMatrixColumn[];
  /** 이 메뉴를 연 버튼. */
  anchor: HTMLElement;
  onClose: () => void;
}

/** 행 끝 더보기. 상품 하나를 여러 몰에 걸쳐 다루는 작업만 둔다. */
export function RowActionMenu({
  masterProductId,
  columns,
  anchor,
  onClose,
}: RowActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const menuStyle = useAnchoredStyle(anchor, 224);

  const count = (predicate: (column: MallListingMatrixColumn) => boolean) =>
    columns.filter(predicate).length;

  const bulk = [
    {
      key: 'create',
      label: '몰에 등록',
      icon: ArrowUpFromLine,
      malls: count((column) => column.actions.createListing),
    },
    {
      key: 'soldout',
      label: '전 몰 품절 처리',
      icon: PackageX,
      malls: count((column) => column.actions.soldOut),
    },
    {
      key: 'resume',
      label: '전 몰 판매 재개',
      icon: PlayCircle,
      malls: count((column) => column.actions.resume),
    },
    {
      key: 'stock',
      label: '재고 일괄 동기화',
      icon: RefreshCw,
      malls: count((column) => column.actions.setStock),
    },
  ];

  return (
    <FloatingLayer>
      <div
        ref={ref}
        role="menu"
        style={menuStyle}
        className="z-40 space-y-0.5 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-lg"
      >
        <Link
          href={`/product-hub/${masterProductId}`}
          role="menuitem"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink size={12} />
          상품 상세
        </Link>
        <div className="my-1 border-t border-slate-100" />
        {bulk.map((entry) => (
          <button
            key={entry.key}
            // 비활성이지만 읽혀야 한다. 무엇이 곧 가능해지는지가 이 메뉴의 내용이다.
            type="button"
            role="menuitem"
            disabled
            title={NOT_WIRED}
            className="flex w-full cursor-not-allowed items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-left text-xs text-slate-600"
          >
            <entry.icon size={12} className="flex-none text-slate-400" />
            <span className="flex-1 truncate">{entry.label}</span>
            <span className="flex-none rounded bg-white px-1 text-[9px] font-medium text-slate-500">
              {entry.malls}개 몰
            </span>
          </button>
        ))}
        <p className="mt-1.5 border-t border-slate-100 px-2 pt-1.5 text-[10px] leading-relaxed text-slate-500">
          아직 화면만 있습니다. 실행은 몰마다 어댑터가 붙어야 열립니다.
        </p>
      </div>
    </FloatingLayer>
  );
}
