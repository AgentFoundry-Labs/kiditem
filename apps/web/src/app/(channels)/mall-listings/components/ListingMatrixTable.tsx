'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CircleSlash, MoreHorizontal, PauseCircle, X } from 'lucide-react';
import type {
  MallListingMatrixColumn,
  MallListingMatrixRow,
  MallListingState,
} from '@kiditem/shared/mall-publishing';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  MALL_LISTING_STATE_PRESENTATION,
  mallAccentClass,
  mallLogoPath,
  mallMonogram,
  productMonogram,
} from '../../_shared/mall-presentation';
import { CellActionPopover, RowActionMenu } from './ListingActionMenus';

const STATE_ICON: Partial<Record<MallListingState, typeof Check>> = {
  published: Check,
  error: X,
  unknown: AlertTriangle,
  paused: PauseCircle,
  discontinued: CircleSlash,
};

/**
 * 왼쪽에 고정되는 열의 좌표.
 *
 * 몰이 25곳이라 표는 반드시 가로로 넘친다. 스크롤하는 동안 "이게 무슨 상품이고
 * 재고가 얼마인가"가 사라지면 오른쪽 끝 칸이 무엇에 대한 것인지 알 수 없다.
 * 그래서 상품·재고·액션은 붙잡아 두고 몰만 흐르게 한다.
 */
const STICKY = {
  check: { width: 'w-11', left: 'left-0' },
  product: { width: 'w-[300px]', left: 'left-11' },
  stock: { width: 'w-[76px]', left: 'left-[344px]' },
  action: { width: 'w-[104px]', left: 'left-[420px]' },
} as const;

/** 고정 열 공통. 스크롤된 몰 칸이 뒤로 비쳐 보이지 않게 배경을 직접 칠한다. */
const STICKY_CELL = 'sticky z-10 bg-white group-hover:bg-slate-50';
const STICKY_HEAD = 'sticky z-20 bg-slate-50';
/** 고정 구간과 스크롤 구간의 경계. */
const STICKY_EDGE = 'shadow-[1px_0_0_0_theme(colors.slate.200)]';

interface ListingMatrixTableProps {
  columns: MallListingMatrixColumn[];
  rows: MallListingMatrixRow[];
  selected: ReadonlySet<string>;
  loading: boolean;
  onToggle: (masterProductId: string) => void;
  onToggleAll: () => void;
}

/**
 * 상품 × 몰 등록 현황.
 *
 * 행이 상품, 열이 몰, 칸이 그 몰에서의 상태다. **연결된 몰은 전부 열이 된다** —
 * 25곳에 파는데 2곳만 보여주면 나머지에 무엇을 안 올렸는지가 화면에서 사라지고,
 * 그게 이 표로 답해야 하는 질문이다.
 *
 * 다만 리스팅을 아직 가져오지 않은 열은 머리에 '미수집'이 붙고 칸이 흐려진다.
 * 그 열의 '미등록'은 몰에 없다는 뜻이 아니라 우리가 모른다는 뜻이다.
 */
export function ListingMatrixTable({
  columns,
  rows,
  selected,
  loading,
  onToggle,
  onToggleAll,
}: ListingMatrixTableProps) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.masterProductId));
  // 한 번에 하나만 열린다. 표 전체가 한 좌표를 들고 있어야 다른 칸을 누를 때
  // 이전 것이 저절로 닫힌다.
  const [openCell, setOpenCell] = useState<
    { rowId: string; mallKey: string; rect: DOMRect } | null
  >(null);
  const [openRowMenu, setOpenRowMenu] = useState<{ rowId: string; rect: DOMRect } | null>(null);

  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table className="min-w-max">
          <thead>
            <tr>
              <th className={cn(STICKY_HEAD, STICKY.check.width, STICKY.check.left, 'pr-0')}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="이 페이지 전체 선택"
                  className="h-4 w-4 accent-purple-600"
                />
              </th>
              <th className={cn(STICKY_HEAD, STICKY.product.width, STICKY.product.left)}>
                <span className="block w-[268px]">상품 정보</span>
              </th>
              <th className={cn(STICKY_HEAD, STICKY.stock.width, STICKY.stock.left, 'text-right')}>
                재고
              </th>
              <th
                className={cn(
                  STICKY_HEAD,
                  STICKY.action.width,
                  STICKY.action.left,
                  STICKY_EDGE,
                  'text-right',
                )}
              >
                액션
              </th>
              {columns.map((column) => (
                <MallHeader key={column.mallKey} column={column} />
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 4} className="empty-state">
                  불러오는 중
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 4} className="empty-state">
                  상품이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <MatrixRow
                  key={row.masterProductId}
                  row={row}
                  columns={columns}
                  checked={selected.has(row.masterProductId)}
                  onToggle={() => onToggle(row.masterProductId)}
                  openCell={openCell?.rowId === row.masterProductId ? openCell : null}
                  onOpenCell={(mallKey, rect) => {
                    setOpenRowMenu(null);
                    setOpenCell((current) =>
                      current?.rowId === row.masterProductId && current.mallKey === mallKey
                        ? null
                        : { rowId: row.masterProductId, mallKey, rect },
                    );
                  }}
                  rowMenu={openRowMenu?.rowId === row.masterProductId ? openRowMenu : null}
                  onToggleMenu={(rect) => {
                    setOpenCell(null);
                    setOpenRowMenu((current) =>
                      current?.rowId === row.masterProductId
                        ? null
                        : { rowId: row.masterProductId, rect },
                    );
                  }}
                  onCloseMenus={() => {
                    setOpenCell(null);
                    setOpenRowMenu(null);
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MallHeader({ column }: { column: MallListingMatrixColumn }) {
  return (
    <th className="w-[104px] text-center">
      <span className="flex w-[72px] flex-col items-center gap-1">
        <span className="flex items-center gap-1.5">
          <MallIcon mallKey={column.mallKey} mallName={column.mallName} />
          <span className="min-w-0 truncate normal-case" title={column.mallName}>
            {column.mallName}
          </span>
        </span>
        {column.imported ? (
          <span className="text-[10px] font-normal normal-case tracking-normal text-slate-400">
            {formatNumber(column.listingCount)}건
          </span>
        ) : (
          <span
            title="이 몰의 리스팅을 아직 가져오지 않았습니다. 아래 칸의 '미등록'은 몰에 없다는 뜻이 아니라 우리가 모른다는 뜻입니다."
            className="rounded bg-amber-50 px-1 text-[10px] font-normal normal-case tracking-normal text-amber-700"
          >
            미수집
          </span>
        )}
      </span>
    </th>
  );
}


/**
 * 몰 아이콘.
 *
 * 각 몰의 공식 파비콘이 있으면 그걸 쓴다. 없는 몰(지마켓·옥션·키즈노트 등 파비콘을
 * 공개 경로로 안 내주는 곳)은 머리글자 타일이다. 비슷한 아이콘을 지어내지 않는다 —
 * 열을 잘못 짚으면 엉뚱한 몰에 상품을 보내게 된다.
 */
function MallIcon({ mallKey, mallName }: { mallKey: string; mallName: string }) {
  const logo = mallLogoPath(mallKey);
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일이라 최적화 대상이 아니다
      <img
        src={logo}
        alt=""
        className="h-4 w-4 flex-none rounded-[3px] object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-4 w-4 flex-none items-center justify-center rounded text-[9px] font-bold',
        mallAccentClass(mallKey),
      )}
    >
      {mallMonogram(mallName)}
    </span>
  );
}

function MatrixRow({
  row,
  columns,
  checked,
  onToggle,
  openCell,
  onOpenCell,
  rowMenu,
  onToggleMenu,
  onCloseMenus,
}: {
  row: MallListingMatrixRow;
  columns: MallListingMatrixColumn[];
  checked: boolean;
  onToggle: () => void;
  openCell: { mallKey: string; rect: DOMRect } | null;
  onOpenCell: (mallKey: string, rect: DOMRect) => void;
  rowMenu: { rect: DOMRect } | null;
  onToggleMenu: (rect: DOMRect) => void;
  onCloseMenus: () => void;
}) {
  const cellByMall = new Map(row.cells.map((cell) => [cell.mallKey, cell]));
  const rowTone = checked ? 'bg-primary-soft' : 'bg-white';

  return (
    <tr className={cn('group', checked && 'bg-primary-soft')}>
      <td className={cn('sticky z-10 pr-0 group-hover:bg-slate-50', STICKY.check.left, rowTone)}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`${row.name} 선택`}
          className="h-4 w-4 accent-purple-600"
        />
      </td>
      <td
        className={cn(
          'sticky z-10 whitespace-normal group-hover:bg-slate-50',
          STICKY.product.left,
          rowTone,
        )}
        title={`최근 변경 ${formatDateTime(row.updatedAt)}`}
      >
        {/* 표가 가로로 넘치므로 셀 안쪽 폭을 직접 묶는다. `<td>` 의 width 는
            내용이 길면 늘어나는 제안값이라, 안 묶으면 긴 카테고리 경로가 고정
            구간 밖으로 새어 나와 몰 칸 위에 겹쳐 보인다. */}
        <div className="flex w-[268px] items-start gap-2.5 overflow-hidden">
          <ProductThumbnail imageUrl={row.imageUrl} name={row.name} seed={row.masterProductId} />
          <span className="min-w-0 flex-1">
            <span className="block line-clamp-2 font-medium text-slate-900">{row.name}</span>
            <span className="mt-0.5 block truncate text-xs text-slate-400" title={row.code}>
              {shortCode(row.code)}
              {row.category ? ` · ${row.category}` : ''}
            </span>
          </span>
        </div>
      </td>
      <td
        className={cn(
          'sticky z-10 text-right tabular-nums group-hover:bg-slate-50',
          STICKY.stock.left,
          rowTone,
        )}
      >
        {row.stock === null ? (
          <span className="text-slate-300" title="셀피아 재고에 연결된 SKU가 없습니다.">
            —
          </span>
        ) : (
          <span className={row.stock === 0 ? 'text-red-600' : 'text-slate-700'}>
            {formatNumber(row.stock)}
          </span>
        )}
      </td>
      <td
        className={cn(
          'sticky z-10 text-right group-hover:bg-slate-50',
          STICKY.action.left,
          STICKY_EDGE,
          rowTone,
        )}
      >
        <div className="relative flex items-center justify-end gap-1">
          <Link
            href={`/product-hub/${row.masterProductId}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            상세보기
          </Link>
          <button
            type="button"
            onClick={(event) => onToggleMenu(event.currentTarget.getBoundingClientRect())}
            aria-haspopup="menu"
            aria-expanded={rowMenu !== null}
            aria-label={`${row.name} 작업 메뉴`}
            className={cn(
              'rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600',
              rowMenu && 'bg-slate-100 text-slate-600',
            )}
          >
            <MoreHorizontal size={14} />
          </button>
          {rowMenu ? (
            <RowActionMenu
              masterProductId={row.masterProductId}
              columns={columns}
              anchorRect={rowMenu.rect}
              onClose={onCloseMenus}
            />
          ) : null}
        </div>
      </td>
      {columns.map((column) => {
        const cell = cellByMall.get(column.mallKey) ?? null;
        const state = cell?.state ?? 'unregistered';
        return (
          <td key={column.mallKey} className="text-center">
            <div className="relative inline-block">
              <button
                type="button"
                onClick={(event) =>
                  onOpenCell(column.mallKey, event.currentTarget.getBoundingClientRect())
                }
                aria-haspopup="dialog"
                aria-label={`${row.name} · ${column.mallName} 작업`}
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <StatePill
                  state={state}
                  rawStatus={cell?.rawStatus ?? null}
                  warning={cell?.warning ?? null}
                  updatedAt={cell?.updatedAt ?? null}
                  imported={column.imported}
                />
              </button>
              {openCell?.mallKey === column.mallKey ? (
                <CellActionPopover
                  column={column}
                  productName={row.name}
                  state={state}
                  rawStatus={cell?.rawStatus ?? null}
                  externalId={cell?.externalId ?? null}
                  anchorRect={openCell.rect}
                  onClose={onCloseMenus}
                />
              ) : null}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

/**
 * 상품 사진.
 *
 * 있으면 보여주고 없으면 머리글자 타일이다. 사진은 몰 리스팅에 붙은 콘텐츠에서만
 * 나오고(라이브 실측 2026-09-09: 등록된 408건 중 30건), 상품 마스터 자체는 사진을
 * 들고 있지 않다. 깨진 이미지 자리를 남기는 것보다 타일이 낫다.
 */
function ProductThumbnail({
  imageUrl,
  name,
  seed,
}: {
  imageUrl: string | null;
  name: string;
  seed: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 몰 CDN 은 next/image 허용 호스트가 아니다
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        className="h-14 w-14 flex-none rounded-lg border border-slate-200 bg-white object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      title="저장된 상품 사진이 없습니다."
      className={cn(
        'flex h-14 w-14 flex-none items-center justify-center rounded-lg text-base font-bold',
        mallAccentClass(seed),
      )}
    >
      {productMonogram(name)}
    </span>
  );
}

function StatePill({
  state,
  rawStatus,
  warning,
  updatedAt,
  imported,
}: {
  state: MallListingState;
  rawStatus: string | null;
  warning: string | null;
  updatedAt: string | null;
  imported: boolean;
}) {
  const presentation = MALL_LISTING_STATE_PRESENTATION[state];
  const Icon = STATE_ICON[state];
  const title = [
    rawStatus ? `몰 상태: ${rawStatus}` : null,
    warning,
    updatedAt ? `갱신 ${formatDateTime(updatedAt)}` : null,
    !imported && state === 'unregistered'
      ? '이 몰은 리스팅을 아직 가져오지 않았습니다. 몰에 없다는 뜻이 아닙니다.'
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      title={title || undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        presentation.tone,
        // 가져오지 않은 열의 미등록은 사실이 아니라 공백이다. 더 흐리게 둔다.
        !imported && state === 'unregistered' && 'opacity-40',
      )}
    >
      {Icon ? <Icon size={11} /> : <span className={cn('h-1.5 w-1.5 rounded-full', presentation.dot)} />}
      {presentation.label}
    </span>
  );
}

/**
 * 상품 코드.
 *
 * 실제 값은 `INV-SELLPIA-<uuid>` 라 표에서 아무것도 알려주지 않는다. 사람이
 * 알아볼 수 있는 꼬리만 보이고 전체는 툴팁에 남긴다.
 */
function shortCode(code: string): string {
  const match = /^INV-SELLPIA-([0-9a-f]{8})/i.exec(code);
  return match ? `SELLPIA-${match[1]!.toUpperCase()}` : code;
}
