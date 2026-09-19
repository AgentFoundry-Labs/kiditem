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
import type { MallListingMatrixColumn, MallListingState } from '@kiditem/shared/mall-publishing';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { recordMallOperationOutcome } from '@/lib/mall-operation-outcomes-api';
import { MALL_LISTING_STATE_PRESENTATION } from '../../_shared/mall-presentation';
import {
  availabilityOutcome,
  mallReadLagsAfterSend,
  mallSoldOutNote,
  mallSoldOutWord,
  canReadMallAvailability,
  canSendMallAvailability,
  sendMallAvailability,
  withObjectParticle,
  type MallLiveSummary,
} from '../../_shared/mall-availability-send';
import type { MallLiveCell } from '../hooks/use-mall-live-availability';
import { showAvailabilityWarnings } from '../../_shared/MallAvailabilitySend';

/**
 * 액션 메뉴.
 *
 * **아직 아무것도 실행하지 않는다.** 지금 여기서 답하는 질문은 "이 몰에서 무엇이
 * 가능한가" 하나다. 가능 여부는 서버 매니페스트가 정하고 화면은 그것만 읽는다 —
 * 되는 것처럼 보이는 버튼을 만들어 두면 언젠가 눌리고, 그게 몰에 나가는 순간
 * 되돌릴 수 없는 것도 있다.
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
  /** 확장이 몰에서 확인한 상태(품절이면 true)를 칸에 그대로 둔다. 조회가 늦게 따라오는 몰에서 쓴다. */
  onSettleLive?: (soldOut: boolean) => void;
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
  onSettleLive,
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
  const presentation = MALL_LISTING_STATE_PRESENTATION[state];
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);

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
    if (!spec.run || !externalId || !canSendMallAvailability(column.mallKey)) return;
    const resume = spec.run === 'resume';
    setRunning(spec.key);
    try {
      // 상품 하나다 — 확장이 그 상품의 몰 화면(쿠팡 윙 상품목록)을 앞에 띄워 거기서 보내고 바뀐 재고를 보여 준다.
      const result = await sendMallAvailability(column.mallKey, [externalId], { resume, show: true });
      showAvailabilityWarnings(result.warnings);
      if (result.sent === 0) throw new Error(`${column.mallName}이 이 상품을 받지 않았습니다.`);
      // 보낸 것은 성공이 아니다 — 몰을 다시 읽어 바뀐 것이 확인된 것만 성공이다(도매꾹 · 쿠팡 윙).
      const recorded = availabilityOutcome(result);
      void recordMallOperationOutcome({
        mallKey: column.mallKey,
        operation: 'availability_stage',
        outcome: recorded.outcome,
        reasonCode: recorded.reasonCode,
        itemCount: result.sent,
        failedCount: result.failed,
        warningCount: result.warnings.length,
      });
      // 쿠팡 윙은 그 상품의 상품목록을 앞에 띄워 보냈다. 상품목록은 늦게 따라오므로 보였는지도 말한다.
      const listNote = result.listShown === true
        ? ` 열린 ${column.mallName} 상품목록에도 ${resume ? '재고가' : '품절로'} 보입니다.`
        : result.listShown === false
          ? ` ${column.mallName} 상품목록 화면은 조금 늦게 바뀝니다 — 1분쯤 뒤 새로고침하면 보입니다.`
          : '';
      // 이 몰에서 품절이 실제로 하는 일(판매중지 · 품절)의 이름으로 말한다.
      const word = mallSoldOutWord(column.mallKey);
      toast.success(`${column.mallName} · ${withObjectParticle(resume ? '판매 재개' : word)} 보냈습니다.`, {
        description: result.requestOnly
          ? '온채널은 관리자 승인을 거칩니다 — 승인 전까지 반영이 아닙니다.'
          : recorded.outcome === 'succeeded'
            ? `${column.mallName}에서 다시 읽어 ${resume ? '다시 팔리는' : `${word}로 바뀐`} 것을 확인했습니다.${listNote}`
            : '반영은 몰을 다시 가져와야 확인됩니다.',
        duration: 10_000,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mallPublishing.all });
      // 지금 재고를 읽을 수 있는 몰은 창을 닫지 않고 몰에서 다시 읽어 바뀐 상태를 그 자리에서 보여 준다. 조회가 늦게
      // 따라오는 몰(롯데ON)은 확장이 이미 확인한 결과를 그대로 쓴다 — 바로 다시 읽으면 옛 값을 받는다.
      if (liveReadable && recorded.outcome === 'succeeded' && mallReadLagsAfterSend(column.mallKey) && onSettleLive) {
        onSettleLive(!resume);
      } else if (liveReadable) readLive();
      else onClose();
    } catch (error) {
      // 보내지 못한 것도 관찰 기록에 남긴다(일괄 화면과 같게).
      void recordMallOperationOutcome({
        mallKey: column.mallKey,
        operation: 'availability_stage',
        outcome: 'failed',
        reasonCode: 'extension_unavailable',
        itemCount: 1,
      });
      toast.error(error instanceof Error ? error.message : '보내지 못했습니다.');
    } finally {
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
        className="z-40 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg"
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
            const runnable = Boolean(spec.run) && spec.available && Boolean(externalId);
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
