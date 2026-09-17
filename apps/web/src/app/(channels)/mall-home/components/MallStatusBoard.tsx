'use client';

import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Minus,
  RefreshCw,
  ShieldAlert,
  Store,
  XCircle,
} from 'lucide-react';
import { MALL_SESSION_PROBE_CAPABILITY } from '@/lib/mall-session-probe';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import { mallAccentClass, mallLogoPath, mallMonogram } from '../../_shared/mall-presentation';
import type { MallStatusTile, MallTileTone, TileLoginState } from '../lib/mall-alerts';
import type { MallSessionView } from '../lib/mall-session';

const TONE: Record<MallTileTone, { text: string; Icon: typeof Minus }> = {
  failed: { text: 'text-red-600', Icon: XCircle },
  attention: { text: 'text-red-600', Icon: AlertTriangle },
  running: { text: 'text-blue-600', Icon: Loader2 },
  ok: { text: 'text-emerald-600', Icon: CheckCircle2 },
  idle: { text: 'text-slate-400', Icon: Minus },
};

/** 타일의 로그인 칩 — 글과 아이콘으로 말한다. 확인하지 못한 몰을 초록으로 칠하지 않는다. */
const LOGIN: Record<TileLoginState, { word: string; chip: string; Icon: typeof Minus; title: string }> = {
  checking: {
    word: '확인 중',
    chip: 'bg-slate-100 text-slate-500',
    Icon: Loader2,
    title: '로그인 상태를 확인하는 중입니다.',
  },
  signed_in: {
    word: '로그인됨',
    chip: 'bg-emerald-50 text-emerald-700',
    Icon: CheckCircle2,
    title: '이 브라우저에서 몰 관리자에 로그인되어 있습니다.',
  },
  signed_out: {
    word: '로그인 필요',
    chip: 'bg-red-100 text-red-700',
    Icon: KeyRound,
    title: '몰 관리자 화면을 열면 로그인 화면이 나옵니다(또는 화면에 닿지 못했습니다). 로그인해야 수집 · 등록이 됩니다.',
  },
  verification: {
    word: '인증 필요',
    chip: 'bg-red-100 text-red-700',
    Icon: ShieldAlert,
    title: '로그인은 되어 있지만 몰이 본인확인 · OTP 를 요구합니다. 몰 화면에서 인증하셔야 주문이 보입니다.',
  },
};

/**
 * 몰별 상태 — 연결된 몰마다 지금 어떤지 한 줄씩, 그리고 로그인 상태.
 *
 * 상태는 그 몰의 가장 최근 알림 · 기억과 지금 상태(로그인 정보 등)에서 나온다. 로그인 상태는
 * 확장이 몰 관리자 화면을 조용히 읽고, 그걸로 모르면 화면을 열어 본다 — 로그인은 하지 않는다.
 * 확인한 몰은 로그인됨 · 인증 필요 · 로그인 필요 셋 중 하나다.
 * 색만으로 말하지 않고 아이콘과 글로 함께 적는다. 타일을 누르면 오른쪽 알림판이 그 몰 알림만
 * 보여 준다.
 */
export function MallStatusBoard({
  tiles,
  hasOverview,
  selectedMallKey,
  onSelect,
  session,
}: {
  tiles: readonly MallStatusTile[];
  /** 몰 목록을 받았는가. 못 받았으면 빈 목록을 '몰 없음'으로 읽지 않게 한다. */
  hasOverview: boolean;
  selectedMallKey: string | null;
  onSelect: (mallKey: string | null) => void;
  session: MallSessionView;
}) {
  const troubled = tiles.filter((tile) => tile.tone === 'failed' || tile.tone === 'attention').length;
  return (
    <section id="mall-status" className="card scroll-mt-6 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Store size={16} aria-hidden />
          </span>
          <h2 className="section-title text-base">몰별 상태</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
            {hasOverview ? `${formatNumber(tiles.length)}곳` : '불러오는 중'}
          </span>
          {troubled > 0 ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-600">
              확인할 몰 {formatNumber(troubled)}곳
            </span>
          ) : null}
        </div>
        {tiles.length > 0 ? <LoginSummary session={session} /> : null}
      </div>
      <p className="mt-1.5 text-xs text-slate-400">누르면 오른쪽 알림판이 그 몰 알림만 보여 줍니다.</p>

      {tiles.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-5">
          {tiles.map((tile) => (
            <li key={tile.mallKey}>
              <MallTile
                tile={tile}
                selected={tile.mallKey === selectedMallKey}
                onClick={() => onSelect(tile.mallKey === selectedMallKey ? null : tile.mallKey)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          {hasOverview ? '연결된 몰이 없습니다.' : '몰 목록을 불러오는 중입니다.'}
        </p>
      )}
    </section>
  );
}

/**
 * 로그인 상태 한 줄 — 로그인됨 · 인증 필요 · 로그인 필요 몰 수와 확인한 때.
 * 확장이 없으면 없다고, 옛 버전이면 그 버전과 빠진 기능을 적는다 — 둘을 섞지 않는다.
 */
function LoginSummary({ session }: { session: MallSessionView }) {
  const { status, counts, checkedAt, extensionVersion, recheck } = session;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span role="status" aria-label="로그인 상태" className="inline-flex items-center gap-1.5">
        <KeyRound size={13} className="flex-none text-slate-400" aria-hidden />
        {status === 'done' ? (
          <span>
            로그인됨 {formatNumber(counts.signedIn)} ·{' '}
            <span className={cn(counts.verification > 0 && 'font-semibold text-red-600')}>
              인증 필요 {formatNumber(counts.verification)}
            </span>{' '}
            ·{' '}
            <span className={cn(counts.signedOut > 0 && 'font-semibold text-red-600')}>
              로그인 필요 {formatNumber(counts.signedOut)}
            </span>
            {checkedAt !== null ? ` · ${timeAgo(new Date(checkedAt))} 확인` : ''}
          </span>
        ) : (
          <span>{pendingText(status, counts.checking, extensionVersion)}</span>
        )}
      </span>
      <button
        type="button"
        onClick={recheck}
        disabled={status === 'idle' || status === 'running'}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw size={12} className={cn(status === 'running' && 'animate-spin')} aria-hidden />
        다시 확인
      </button>
    </div>
  );
}

function pendingText(status: MallSessionView['status'], checking: number, version: string | null): string {
  switch (status) {
    case 'running':
      return `로그인 확인 중(몰 화면을 열어 봅니다) · 남은 몰 ${formatNumber(checking)}곳`;
    case 'no_extension':
      return 'KidItem 확장이 없어 로그인 상태를 확인하지 못했습니다.';
    case 'outdated':
      return `확장 ${version ?? '(버전 모름)'}에는 로그인 확인(${MALL_SESSION_PROBE_CAPABILITY})이 없습니다. 확장을 다시 불러오면 확인합니다.`;
    default:
      return '로그인 상태 확인 준비 중';
  }
}

function MallTile({
  tile,
  selected,
  onClick,
}: {
  tile: MallStatusTile;
  selected: boolean;
  onClick: () => void;
}) {
  const { text, Icon } = TONE[tile.tone];
  const login = tile.login ? LOGIN[tile.login] : null;
  const LoginIcon = login?.Icon;
  const logo = mallLogoPath(tile.mallKey);
  // 문제 있는 몰(실패 · 확인 필요 · 로그인 풀림)은 타일 전체를 빨갛게 — 한눈에 골라 보이게.
  const problem = tile.tone === 'failed' || tile.tone === 'attention';
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${tile.mallName} ${tile.label}${login ? `, 로그인 상태 ${login.word}` : ''}`}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
        selected
          ? 'border-primary bg-primary-soft'
          : problem
            ? 'border-red-200 bg-red-50 hover:border-red-300'
            : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일
        <img
          src={logo}
          alt=""
          className="h-9 w-9 flex-none rounded-xl border border-slate-200 bg-white object-contain p-1"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex h-9 w-9 flex-none items-center justify-center rounded-xl text-xs font-bold',
            mallAccentClass(tile.mallKey),
          )}
        >
          {mallMonogram(tile.mallName)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-slate-900">{tile.mallName}</span>
          {tile.attentionCount > 0 ? (
            <span className="flex-none rounded-full bg-red-100 px-1.5 text-[10px] font-semibold tabular-nums text-red-700">
              {formatNumber(tile.attentionCount)}
            </span>
          ) : null}
        </span>
        <span
          className={cn('mt-0.5 flex items-center gap-1 text-xs', text)}
          // 왜 그런지는 기억에 남아 있다. 라벨만으로는 알 수 없어 마우스를 올리면 이유를 보여 준다.
          title={tile.detail ?? undefined}
        >
          <Icon size={12} className={cn('flex-none', tile.tone === 'running' && 'animate-spin')} aria-hidden />
          <span className="truncate">{tile.label}</span>
        </span>
        {tile.at || login ? (
          <span className="mt-1 flex items-center justify-between gap-1">
            <span className="truncate text-[11px] tabular-nums text-slate-400">{tile.at ? timeAgo(tile.at) : ''}</span>
            {login && LoginIcon ? (
              <span
                title={login.title}
                className={cn(
                  'inline-flex flex-none items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-medium',
                  login.chip,
                )}
              >
                <LoginIcon size={10} className={cn('flex-none', tile.login === 'checking' && 'animate-spin')} aria-hidden />
                {login.word}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}
