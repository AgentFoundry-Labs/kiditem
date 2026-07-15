import { useEffect, useState } from 'react';
import { Loader2, Truck, Upload } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { isTrackingSupportedMall } from '../lib/icecream-tracking-api';
import {
  formatMallCollectionTime,
  isAutoDetectableMall,
  isBrowserCollectableMall,
  type ConversionState,
} from '../lib/order-collection-page-model';
import {
  classifyMallAccount,
  MALL_ACCOUNT_GROUPS,
} from '../lib/mall-account-grouping';
import type { MallCollectionStat } from '../lib/order-collection-stats';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

interface MallAccountGroupsProps {
  accounts: OrderCollectionMallAccount[];
  stats: Map<string, MallCollectionStat>;
  selectedMall: OrderCollectionMallAccount | null | undefined;
  settingsOpen: boolean;
  browserCollecting: boolean;
  collectingKeys: Set<string>;
  cancellingKeys: Set<string>;
  conversionState: ConversionState;
  autoDetect: boolean;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  onCollectMall: (account: OrderCollectionMallAccount) => void;
  onCancelMall: (account: OrderCollectionMallAccount) => void;
  onUploadTracking: (account: OrderCollectionMallAccount) => void;
}

export function MallAccountGroups({
  accounts,
  stats,
  selectedMall,
  settingsOpen,
  browserCollecting,
  collectingKeys,
  cancellingKeys,
  conversionState,
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  onCollectMall,
  onCancelMall,
  onUploadTracking,
}: MallAccountGroupsProps) {
  return (
    <div className="space-y-5 overflow-x-auto pb-1">
      {MALL_ACCOUNT_GROUPS.map((group) => {
        const groupedAccounts = accounts.filter((account) =>
          classifyMallAccount(
            account,
            stats.get(account.key),
            collectingKeys.has(account.key) || cancellingKeys.has(account.key),
          ) === group.id,
        );

        return (
          <section key={group.id} aria-labelledby={`mall-group-${group.id}`}>
            <h3
              id={`mall-group-${group.id}`}
              className="mb-2 text-xs font-semibold text-slate-600"
            >
              {group.label}{' '}
              <span className="text-slate-400">{groupedAccounts.length}</span>
            </h3>
            <div className="grid min-w-[720px] grid-cols-5 gap-3">
              {groupedAccounts.map((account) => (
                <MallAccountCard
                  key={account.key}
                  account={account}
                  collectionStat={stats.get(account.key)}
                  isOpen={settingsOpen && selectedMall?.key === account.key}
                  isCollecting={collectingKeys.has(account.key)}
                  isCancelling={cancellingKeys.has(account.key)}
                  browserCollecting={browserCollecting}
                  conversionState={conversionState}
                  autoDetect={autoDetect}
                  autoNextRunAt={autoNextRunAt}
                  autoRunning={autoRunning}
                  onOpenSettings={onOpenSettings}
                  onCollectMall={onCollectMall}
                  onCancelMall={onCancelMall}
                  onUploadTracking={onUploadTracking}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface MallAccountCardProps {
  account: OrderCollectionMallAccount;
  collectionStat: MallCollectionStat | undefined;
  isOpen: boolean;
  isCollecting: boolean;
  isCancelling: boolean;
  browserCollecting: boolean;
  conversionState: ConversionState;
  autoDetect: boolean;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  onCollectMall: (account: OrderCollectionMallAccount) => void;
  onCancelMall: (account: OrderCollectionMallAccount) => void;
  onUploadTracking: (account: OrderCollectionMallAccount) => void;
}

function MallAccountCard({
  account,
  collectionStat,
  isOpen,
  isCollecting,
  isCancelling,
  browserCollecting,
  conversionState,
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  onCollectMall,
  onCancelMall,
  onUploadTracking,
}: MallAccountCardProps) {
  const collectable = account.enabled && isBrowserCollectableMall(account);
  const autoDetectable = isAutoDetectableMall(account);
  const trackingSupported = isTrackingSupportedMall(account.key);

  return (
    <article
      aria-label={`${account.name} 계정 카드`}
      className={cn(
        'flex flex-col rounded-xl border p-3.5 transition-colors',
        collectable
          ? 'border-slate-200 hover:border-purple-300'
          : 'border-slate-100 bg-slate-50/40',
        isOpen && 'ring-1 ring-purple-300',
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 flex-none rounded-full',
              collectable ? 'bg-emerald-500' : 'bg-slate-300',
            )}
            title={collectable ? '수집 가능' : '준비 중'}
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

      <div className="mt-2.5 grid grid-cols-2 divide-x divide-slate-200/80 overflow-hidden rounded-lg bg-slate-50">
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
          title="오늘 주문 중 셀피아 전송 대기"
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
          <div className="mt-1 text-[10px] text-slate-400">전송 대기</div>
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
            : browserCollecting || conversionState === 'converting' || !collectable}
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
