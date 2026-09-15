import { useEffect, useState, type ReactNode } from 'react';
import { Truck, Upload } from 'lucide-react';
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

/** 한 몰 카드가 자기 수집 컨트롤에서 받아 쓰는 것. */
export interface MallCardCollection {
  /** 이 몰의 공용 시작·중단 컨트롤. */
  control: ReactNode;
  /** owner가 알려 준 진행 중. 다른 탭이 시작한 수집도 여기서 보인다(KID-189). */
  running: boolean;
}

interface MallAccountGroupsProps {
  accounts: OrderCollectionMallAccount[];
  stats: Map<string, MallCollectionStat>;
  failedMallReasonByKey?: Map<string, FailedMallReason>;
  selectedMall: OrderCollectionMallAccount | null | undefined;
  settingsOpen: boolean;
  autoDetect: boolean;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  /**
   * 몰마다 자기 시작·중단 컨트롤을 하나 그리고, 그 컨트롤이 읽은 owner 진행 중과
   * 함께 카드를 그려 준다(KID-189).
   */
  renderCollectionControl: (
    account: OrderCollectionMallAccount,
    renderCard: (collection: MallCardCollection) => ReactNode,
  ) => ReactNode;
  /** 카드 영역 클릭으로 여는 보조 화면(쿠팡직배송 입고예정일 달력). 없으면 카드 클릭 없음. */
  onOpenCalendar?: (account: OrderCollectionMallAccount) => void;
  onUploadTracking: (account: OrderCollectionMallAccount) => void;
}

export function MallAccountGroups({
  accounts,
  stats,
  failedMallReasonByKey,
  selectedMall,
  settingsOpen,
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  renderCollectionControl,
  onOpenCalendar,
  onUploadTracking,
}: MallAccountGroupsProps) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        data-testid="mall-account-card-grid"
        className="grid min-w-[720px] grid-cols-5 gap-3"
      >
        {accounts.map((account) => (
          <MallAccountCard
            key={account.key}
            account={account}
            collectionStat={stats.get(account.key)}
            failedReason={failedMallReasonByKey?.get(account.key)}
            isOpen={settingsOpen && selectedMall?.key === account.key}
            autoDetect={autoDetect}
            autoNextRunAt={autoNextRunAt}
            autoRunning={autoRunning}
            onOpenSettings={onOpenSettings}
            renderCollectionControl={renderCollectionControl}
            onOpenCalendar={onOpenCalendar}
            onUploadTracking={onUploadTracking}
          />
        ))}
      </div>
    </div>
  );
}

interface MallAccountCardProps {
  account: OrderCollectionMallAccount;
  collectionStat: MallCollectionStat | undefined;
  failedReason: FailedMallReason | undefined;
  isOpen: boolean;
  autoDetect: boolean;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  /** 이 몰의 공용 시작 컨트롤과 그 컨트롤이 읽은 owner 진행 중. */
  renderCollectionControl: MallAccountGroupsProps['renderCollectionControl'];
  /** 카드 영역 클릭으로 여는 보조 화면(쿠팡직배송 입고예정일 달력). 없으면 카드 클릭 없음. */
  onOpenCalendar?: (account: OrderCollectionMallAccount) => void;
  onUploadTracking: (account: OrderCollectionMallAccount) => void;
}

function MallAccountCard({
  account,
  collectionStat,
  failedReason,
  isOpen,
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  renderCollectionControl,
  onOpenCalendar,
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

  // 진행 중 판정은 이 카드가 마운트한 공용 컨트롤이 owner에게서 읽어 준다(KID-189).
  return renderCollectionControl(account, ({ control, running }) => (
    <article
      aria-label={`${account.name} 계정 카드`}
      onClick={cardOpensCalendar && !running
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
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
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

      <div className="mt-2.5">{control}</div>

      <div className="mt-2.5 flex gap-1.5">
        {trackingSupported ? (
          <button
            type="button"
            onClick={() => onUploadTracking(account)}
            disabled={running}
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
  ));
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
