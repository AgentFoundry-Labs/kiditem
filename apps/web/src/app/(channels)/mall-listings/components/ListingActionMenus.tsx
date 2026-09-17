'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowUpFromLine,
  ExternalLink,
  PackageX,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { MallListingMatrixColumn, MallListingState } from '@kiditem/shared/mall-publishing';
import { cn } from '@/lib/utils';
import { MALL_LISTING_STATE_PRESENTATION } from '../../_shared/mall-presentation';

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
    },
    {
      key: 'resume',
      label: '판매 재개',
      icon: PlayCircle,
      available: actions.resume,
      reason: actions.resume ? null : '이 몰은 재개 경로가 확인되지 않았습니다.',
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
  /** 이 메뉴를 연 버튼. 스크롤해도 계속 그 버튼에 붙어 있게 한다. */
  anchor: HTMLElement;
  onClose: () => void;
}

/** 칸 하나를 눌렀을 때. 그 (상품 × 몰) 에서 무엇이 가능한지 보여준다. */
export function CellActionPopover({
  column,
  productName,
  state,
  rawStatus,
  externalId,
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
        </div>

        <ul className="mt-2 space-y-0.5">
          {specs.map((spec) => (
            <li key={spec.key}>
              <button
                type="button"
                disabled
                title={spec.reason ?? NOT_WIRED}
                className={cn(
                  'flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                  spec.available
                    ? 'bg-slate-50 text-slate-700'
                    : 'text-slate-400 line-through decoration-slate-300',
                  spec.danger && spec.available && 'bg-red-50 text-red-700',
                )}
              >
                <spec.icon size={12} className="flex-none" />
                <span className="flex-1 truncate no-underline">{spec.label}</span>
                {spec.available ? (
                  <span className="flex-none rounded bg-white px-1 text-[9px] font-medium text-slate-500">
                    미연결
                  </span>
                ) : (
                  <span className="flex-none text-[9px] text-slate-400">불가</span>
                )}
              </button>
            </li>
          ))}
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

        {externalId ? (
          <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
            몰 상품번호 {externalId}
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
