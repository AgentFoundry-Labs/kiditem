import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GripVertical, Truck, Upload } from 'lucide-react';
import {
  clearMallAutoLoginAttempt,
  clearMallAutoLoginBlock,
  getMallLoginBlocks,
  getMallLoginBlocksServerSnapshot,
  subscribeMallLoginBlocks,
} from '@/lib/mall-login-block';
import { cn, formatNumber } from '@/lib/utils';
import { isTrackingSupportedMall } from '../lib/icecream-tracking-api';
import { hasMallAccountRow } from '../lib/mall-order';
import {
  formatMallCollectionTime,
  isAutoDetectableMall,
  isBrowserCollectableMall,
} from '../lib/order-collection-page-model';
import type { MallCollectionStat } from '../lib/order-collection-stats';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import type { FailedMallReason } from '../hooks/use-order-activity-events';

/** 한 몰 카드가 자기 수집 컨트롤에서 받아 쓰는 것. */
export interface MallCardCollection {
  /** 이 몰의 공용 시작·중단 컨트롤. */
  control: ReactNode;
  /** owner가 알려 준 진행 중. 다른 탭이 시작한 수집도 여기서 보인다(KID-189). */
  running: boolean;
  /**
   * 이 카드의 원천이 카드 영역 클릭으로 무엇을 수집할지 먼저 고르는 화면을 여는가.
   * 몰 키가 아니라 원천이 답한다(KID-255).
   */
  opensChooser: boolean;
}

interface MallAccountGroupsProps {
  accounts: OrderCollectionMallAccount[];
  /** 카드 손잡이를 끌어 순서를 바꾼다. 없으면 손잡이를 감춘다. */
  onMoveMall?: (mallKey: string, direction: -1 | 1) => void;
  onDropMall?: (sourceMallKey: string, targetMallKey: string) => void;
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
  /**
   * 카드 영역 클릭으로 무엇을 수집할지 먼저 고르는 화면을 연다(직배송 입고예정일 달력).
   * 그 화면을 여는지는 카드가 마운트한 원천이 답한다(KID-255).
   */
  onOpenChooser?: (account: OrderCollectionMallAccount) => void;
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
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  renderCollectionControl,
  onOpenChooser,
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
            autoDetect={autoDetect}
            autoNextRunAt={autoNextRunAt}
            autoRunning={autoRunning}
            onOpenSettings={onOpenSettings}
            renderCollectionControl={renderCollectionControl}
            onOpenChooser={onOpenChooser}
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
  autoDetect: boolean;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  /** 이 몰의 공용 시작 컨트롤과 그 컨트롤이 읽은 owner 진행 중. */
  renderCollectionControl: MallAccountGroupsProps['renderCollectionControl'];
  /**
   * 카드 영역 클릭으로 무엇을 수집할지 먼저 고르는 화면을 연다(직배송 입고예정일 달력).
   * 그 화면을 여는지는 카드가 마운트한 원천이 답한다(KID-255).
   */
  onOpenChooser?: (account: OrderCollectionMallAccount) => void;
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
  autoDetect,
  autoNextRunAt,
  autoRunning,
  onOpenSettings,
  renderCollectionControl,
  onOpenChooser,
  onUploadTracking,
}: MallAccountCardProps) {
  const collectable = account.enabled && isBrowserCollectableMall(account);
  const autoDetectable = isAutoDetectableMall(account);
  const trackingSupported = isTrackingSupportedMall(account.key);
  // 오류가 난 몰은 상태등이 빨간불이고 카드 배경도 빨강이다 — 실패한 카드를 한눈에 찾게.
  //
  // 자동 로그인이 막힌 몰도 같은 빨간 카드다. 자동 운전 고리도 자동감지도 이 몰에는 더
  // 들어가지 않는다 — 다시 돌릴지는 사장님이 정하신다.
  const loginBlocks = useSyncExternalStore(
    subscribeMallLoginBlocks,
    getMallLoginBlocks,
    getMallLoginBlocksServerSnapshot,
  );
  const loginBlock = loginBlocks.find((block) => block.mallKey === account.key) ?? null;
  const failed = loginBlock !== null || failedReason !== undefined;
  const needsVerification = failedReason
    ? failedReason === 'auth'
    : loginBlock?.kind === 'verification';
  const failedTitle = needsVerification
    ? '인증 필요 · 재수집 필요'
    : failedReason === 'error'
      ? '수집 오류 · 재수집 필요'
      : '로그인 필요 · 재수집 필요';

  // 카드 아무 데나 잡아 끌리면 수집·설정 클릭과 헷갈린다. 손잡이를 누른 동안만
  // draggable 을 켜서 손잡이로만 순서가 바뀌게 한다. 계정 행이 없는 몰은 순서를 저장하지
  // 않으므로 손잡이도 두지 않는다.
  const reorderable = Boolean(onDropMall) && hasMallAccountRow(account);
  const [dragArmed, setDragArmed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /**
   * 카드 영역을 누르면 무엇을 수집할지 먼저 고르는 화면(직배송 입고예정일 달력)이 열리는가.
   * 판정은 몰 키가 아니라 이 카드가 마운트한 원천이 답한다(KID-255) — 고르는 화면이 없는
   * 원천의 카드는 손 모양 커서도 클릭도 없다. 수집 버튼은 고르는 화면 없이 곧바로 수집한다.
   */
  const opensChooserOnCard = (opensChooser: boolean): boolean =>
    collectable && opensChooser && Boolean(onOpenChooser);

  // 진행 중 판정은 이 카드가 마운트한 공용 컨트롤이 owner에게서 읽어 준다(KID-189).
  return renderCollectionControl(account, ({ control, running, opensChooser }) => (
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
      onClick={opensChooserOnCard(opensChooser) && !running
        ? (event) => {
            // 설정·수집·송장업로드 같은 내부 버튼 클릭까지 삼키지 않는다.
            if ((event.target as HTMLElement).closest('button')) return;
            onOpenChooser?.(account);
          }
        : undefined}
      className={cn(
        'flex flex-col rounded-xl border p-3.5 transition-colors',
        opensChooserOnCard(opensChooser) && 'cursor-pointer',
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
        {loginBlock ? (
          // 자동은 멈췄다. 다시 켜는 건 사장님 몫이다 — 누르면 그때부터 다시 자동으로 돈다.
          <button
            type="button"
            onClick={() => {
              // 사람이 직접 눌렀다 — 차단도 풀고, 한 시간 간격도 기다리지 않는다.
              clearMallAutoLoginBlock(account.key);
              clearMallAutoLoginAttempt(account.key);
            }}
            aria-label={`${account.name} 자동 수집 다시 켜기`}
            title={[
              loginBlock.kind === 'verification'
                ? '자동 수집을 멈췄습니다. 몰에서 직접 인증해 주세요.'
                : '자동 수집을 멈췄습니다. 몰에 직접 로그인해 주세요.',
              loginBlock.reason,
              '직접 로그인하시면 자동으로 풀립니다. 지금 바로 다시 켜려면 누르세요.',
            ]
              .filter(Boolean)
              .join('\n')}
            className="truncate font-medium text-red-600 underline decoration-dotted underline-offset-2 hover:text-red-700"
          >
            {loginBlock.kind === 'verification' ? '자동 멈춤 · 직접 인증' : '자동 멈춤 · 직접 로그인'}
          </button>
        ) : !collectable ? (
          <span className="text-slate-300">준비 중</span>
        ) : autoDetect && autoDetectable && autoNextRunAt !== null ? (
          <AutoDetectCountdown running={autoRunning} targetAt={autoNextRunAt} />
        ) : (
          <span className="text-slate-300">수동</span>
        )}
      </div>

      {/* 수집과 송장 업로드는 한 줄에 나란히 선다. 카드가 스물일곱 장이라 버튼이 한 줄씩
          더 차지하면 화면이 두 배로 길어진다. */}
      <div className="mt-2.5 flex items-start gap-1.5">
        <div className="min-w-0 flex-1">{control}</div>
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
