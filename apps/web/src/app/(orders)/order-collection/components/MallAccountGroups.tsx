import { useEffect, useState } from 'react';
import { GripVertical, Loader2, Truck, Upload } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { isTrackingSupportedMall } from '../lib/icecream-tracking-api';
import {
  formatMallCollectionTime,
  isAutoDetectableMall,
  isBrowserCollectableMall,
} from '../lib/order-collection-page-model';
import type { MallCollectionStat } from '../lib/order-collection-stats';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';
import type { FailedMallReason } from '../hooks/use-order-activity-events';

interface MallAccountGroupsProps {
  accounts: OrderCollectionMallAccount[];
  /** 카드 손잡이를 끌어 순서를 바꾼다. 없으면 손잡이를 감춘다. */
  onMoveMall?: (mallKey: string, direction: -1 | 1) => void;
  onDropMall?: (sourceMallKey: string, targetMallKey: string) => void;
  stats: Map<string, MallCollectionStat>;
  failedMallReasonByKey?: Map<string, FailedMallReason>;
  selectedMall: OrderCollectionMallAccount | null | undefined;
  settingsOpen: boolean;
  collectingKeys: Set<string>;
  cancellingKeys: Set<string>;
  autoDetect: boolean;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  onCollectMall: (account: OrderCollectionMallAccount) => void;
  /** 카드 영역 클릭으로 여는 보조 화면(쿠팡직배송 입고예정일 달력). 없으면 카드 클릭 없음. */
  onOpenCalendar?: (account: OrderCollectionMallAccount) => void;
  onCancelMall: (account: OrderCollectionMallAccount) => void;
  onUploadTracking: (account: OrderCollectionMallAccount) => void;
}

export function MallAccountGroups({
  accounts,
  onMoveMall,
  onDropMall,
  stats,
  failedMallReasonByKey,
  selectedMall,
  settingsOpen,
  collectingKeys,
  cancellingKeys,
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  onCollectMall,
  onOpenCalendar,
  onCancelMall,
  onUploadTracking,
}: MallAccountGroupsProps) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        data-testid="mall-account-card-grid"
        className="grid min-w-[720px] grid-cols-5 gap-3"
      >
        {accounts.map((account, index) => (
          <MallAccountCard
            key={account.key}
            position={index + 1}
            isFirst={index === 0}
            isLast={index === accounts.length - 1}
            onMoveMall={onMoveMall}
            onDropMall={onDropMall}
            account={account}
            collectionStat={stats.get(account.key)}
            failedReason={failedMallReasonByKey?.get(account.key)}
            isOpen={settingsOpen && selectedMall?.key === account.key}
            isCollecting={collectingKeys.has(account.key)}
            isCancelling={cancellingKeys.has(account.key)}
            autoDetect={autoDetect}
            autoNextRunAt={autoNextRunAt}
            autoRunning={autoRunning}
            onOpenSettings={onOpenSettings}
            onCollectMall={onCollectMall}
            onOpenCalendar={onOpenCalendar}
            onCancelMall={onCancelMall}
            onUploadTracking={onUploadTracking}
          />
        ))}
      </div>
    </div>
  );
}


interface MallAccountCardProps {
  account: OrderCollectionMallAccount;
  /** 손잡이 툴팁에 쓰는 현재 순번(1부터). */
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveMall?: (mallKey: string, direction: -1 | 1) => void;
  onDropMall?: (sourceMallKey: string, targetMallKey: string) => void;
  collectionStat: MallCollectionStat | undefined;
  failedReason: FailedMallReason | undefined;
  isOpen: boolean;
  isCollecting: boolean;
  isCancelling: boolean;
  autoDetect: boolean;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  onCollectMall: (account: OrderCollectionMallAccount) => void;
  /** 카드 영역 클릭으로 여는 보조 화면(쿠팡직배송 입고예정일 달력). 없으면 카드 클릭 없음. */
  onOpenCalendar?: (account: OrderCollectionMallAccount) => void;
  onCancelMall: (account: OrderCollectionMallAccount) => void;
  onUploadTracking: (account: OrderCollectionMallAccount) => void;
}

function MallAccountCard({
  account,
  position,
  isFirst,
  isLast,
  onMoveMall,
  onDropMall,
  collectionStat,
  failedReason,
  isOpen,
  isCollecting,
  isCancelling,
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  onCollectMall,
  onOpenCalendar,
  onCancelMall,
  onUploadTracking,
}: MallAccountCardProps) {
  const collectable = account.enabled && isBrowserCollectableMall(account);
  const autoDetectable = isAutoDetectableMall(account);
  const trackingSupported = isTrackingSupportedMall(account.key);
  // 로그인 실패·인증 필요일 때만 상태등을 빨간불 + 카드 배경을 빨강으로 표시한다.
  // 일반 수집 오류(주문 없음 등)는 초록불/흰 배경을 유지한다.
  const failed = failedReason !== undefined;
  const failedTitle =
    failedReason === 'login'
      ? '로그인 필요 · 재수집 필요'
      : '인증 필요 · 재수집 필요';

  // 쿠팡직배송은 카드 영역을 누르면 입고예정일 달력이 열린다.
  // 수집 버튼은 달력 없이 곧바로 수집한다(둘을 섞지 않는다).
  const cardOpensCalendar = collectable && Boolean(onOpenCalendar);

  // 카드 아무 데나 잡아 끌리면 수집·설정 클릭과 헷갈린다. 손잡이를 누른 동안만
  // draggable 을 켜서 손잡이로만 순서가 바뀌게 한다.
  const reorderable = Boolean(onDropMall);
  const [dragArmed, setDragArmed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  return (
    <article
      aria-label={`${account.name} 계정 카드`}
      draggable={dragArmed}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', account.key);
      }}
      onDragEnd={() => {
        setDragArmed(false);
        setDragOver(false);
      }}
      onDragOver={reorderable
        ? (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDragOver(true);
          }
        : undefined}
      onDragLeave={reorderable ? () => setDragOver(false) : undefined}
      onDrop={reorderable
        ? (event) => {
            event.preventDefault();
            setDragOver(false);
            const sourceKey = event.dataTransfer.getData('text/plain');
            if (sourceKey && sourceKey !== account.key) onDropMall?.(sourceKey, account.key);
          }
        : undefined}
      onClick={cardOpensCalendar && !isCollecting
        ? (event) => {
            // 설정·수집·송장업로드 같은 내부 버튼 클릭까지 삼키지 않는다.
            if ((event.target as HTMLElement).closest('button')) return;
            onOpenCalendar?.(account);
          }
        : undefined}
      className={cn(
        'flex flex-col rounded-xl border p-3.5 transition-colors',
        cardOpensCalendar && 'cursor-pointer',
        failed
          ? 'border-red-200 bg-red-50'
          : collectable
            ? 'border-slate-200 hover:border-purple-300'
            : 'border-slate-100 bg-slate-50/40',
        isOpen && 'ring-1 ring-purple-300',
        dragOver && 'ring-2 ring-purple-400',
        dragArmed && 'opacity-60',
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {reorderable ? (
            <button
              type="button"
              aria-label={`${account.name} 순서 ${position}번 — 끌어서 옮기기`}
              title="끌어서 순서 변경 (방향키로도 이동)"
              onMouseDown={() => setDragArmed(true)}
              onMouseUp={() => setDragArmed(false)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' && !isFirst) {
                  event.preventDefault();
                  onMoveMall?.(account.key, -1);
                }
                if (event.key === 'ArrowRight' && !isLast) {
                  event.preventDefault();
                  onMoveMall?.(account.key, 1);
                }
              }}
              className="-ml-1 flex-none cursor-grab rounded p-0.5 text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
            >
              <GripVertical size={13} />
            </button>
          ) : null}
          <span
            className={cn(
              'h-1.5 w-1.5 flex-none rounded-full',
              failed
                ? 'bg-red-500'
                : collectable
                  ? 'bg-emerald-500'
                  : 'bg-slate-300',
            )}
            title={failed ? failedTitle : collectable ? '수집 가능' : '준비 중'}
          />
          <span
            className={cn(
              'truncate text-[13px] font-semibold',
              collectable ? 'text-slate-900' : 'text-slate-400',
            )}
            title={account.name}
          >
            {account.name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onOpenSettings(account)}
          aria-label={`${account.name} 설정`}
          className="flex-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
        >
          설정
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-2 divide-x divide-slate-200/80 overflow-hidden rounded-lg">
        <div
          className="px-2 py-3.5 text-center"
          title={collectionStat
            ? `오늘 수집 ${formatMallCollectionTime(collectionStat.latestAt)}`
            : undefined}
        >
          <div
            className={cn(
              'text-lg font-bold leading-none tabular-nums',
              collectionStat && collectionStat.orderRows > 0
                ? 'text-slate-900'
                : 'text-slate-300',
            )}
          >
            {formatNumber(collectionStat?.orderRows ?? 0)}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">당일</div>
        </div>
        <div
          className="px-2 py-3.5 text-center"
          title="오늘 수집한 주문 중 셀피아 미전송"
        >
          <div
            className={cn(
              'text-lg font-bold leading-none tabular-nums',
              collectionStat && collectionStat.newRows > 0
                ? 'text-purple-600'
                : 'text-slate-300',
            )}
          >
            {formatNumber(collectionStat?.newRows ?? 0)}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">신규</div>
        </div>
      </div>

      <div className="mt-2.5 flex h-5 items-center justify-center text-[11px]">
        {!collectable ? (
          <span className="text-slate-300">준비 중</span>
        ) : autoDetect && autoDetectable && autoNextRunAt !== null ? (
          <AutoDetectCountdown running={autoRunning} targetAt={autoNextRunAt} />
        ) : (
          <span className="text-slate-300">수동</span>
        )}
      </div>

      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => isCollecting ? onCancelMall(account) : onCollectMall(account)}
          aria-label={`${account.name} ${
            isCollecting ? (isCancelling ? '중단 중' : '중단') : '수집'
          }`}
          disabled={isCollecting
            ? isCancelling
            : !collectable}
          title={isCollecting
            ? `${account.name} 수집 중단`
            : !account.enabled
              ? '중지된 계정입니다.'
              : collectable
                ? `${account.name} 개별 수집`
                : '자동 수집 준비 중'}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400',
            isCollecting
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-purple-600 hover:bg-purple-700',
          )}
        >
          {isCollecting ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              {isCancelling ? '중단 중…' : '중단'}
            </>
          ) : '수집'}
        </button>
        {trackingSupported ? (
          <button
            type="button"
            onClick={() => onUploadTracking(account)}
            disabled={isCollecting}
            aria-label={`${account.name} 송장 업로드`}
            title={`${account.name} 송장 업로드`}
            className="inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-purple-200 bg-purple-50 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
          >
            <Upload size={13} />
            송장 업로드
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-label={`${account.name} 송장 업로드 준비 중`}
            className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1 whitespace-nowrap rounded-md border border-dashed border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-400"
          >
            <Truck size={13} />
            준비
          </button>
        )}
      </div>
    </article>
  );
}

function AutoDetectCountdown({
  targetAt,
  running,
}: {
  targetAt: number;
  running: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (running) return <span className="text-purple-600">자동 수집 중</span>;
  const seconds = Math.max(0, Math.ceil((targetAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return (
    <span className="tabular-nums text-purple-600">
      자동 {minutes}:{String(remainder).padStart(2, '0')}
    </span>
  );
}
