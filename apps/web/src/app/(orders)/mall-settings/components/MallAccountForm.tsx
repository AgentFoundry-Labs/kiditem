'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  Save,
  XCircle,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { MallAccountRow, MallAccountRowDraft } from '../lib/mall-account-rows';
import { isPasswordChanged } from '../lib/mall-account-rows';
import { MALL_READINESS_LABEL } from '../lib/mall-capabilities';
import type { MallLoginTestResult } from '../hooks/use-mall-login-test';

const READINESS_TONE: Record<string, string> = {
  ready: 'bg-emerald-500',
  needs_account: 'bg-amber-400',
  paused: 'bg-slate-300',
  preparing: 'bg-slate-200',
};

const FIELD = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400';

/**
 * 몰 하나의 계정 — 쇼핑몰 현황의 설정 창에서 쓴다. 표(`MallAccountTable`)와 같은 초안 · 저장 규칙이다: 저장된
 * 비밀번호는 창이 열 때 불러와 보이고(눈 아이콘으로 가린다), 고쳐 쓰고 저장하면 바뀌며, 비워 두면 그대로다.
 */
export function MallAccountForm({
  row,
  revealed,
  revealing,
  saving,
  testing,
  testBusy,
  testResult,
  onChange,
  onToggleReveal,
  onSave,
  onTestLogin,
}: {
  row: MallAccountRow;
  revealed: boolean;
  revealing: boolean;
  saving: boolean;
  /** 이 몰을 테스트하는 중. */
  testing: boolean;
  /** 다른 몰을 포함해 테스트가 돌고 있다 — 한 번에 하나만. */
  testBusy: boolean;
  testResult: MallLoginTestResult | undefined;
  onChange: (patch: Partial<MallAccountRowDraft>) => void;
  onToggleReveal: () => void;
  onSave: () => void;
  onTestLogin: () => void;
}) {
  const { account, draft } = row;
  const passwordChanged = isPasswordChanged(draft);
  const passwordLoaded = draft.seededPassword !== undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className={cn('h-1.5 w-1.5 rounded-full', READINESS_TONE[row.readiness])} aria-hidden />
        {MALL_READINESS_LABEL[row.readiness]}
        <CapabilityBadge label="주문수집" enabled={row.supportsCollection} />
        <CapabilityBadge label="송장등록" enabled={row.supportsTracking} />
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">아이디</span>
        <input
          value={draft.loginId}
          onChange={(event) => onChange({ loginId: event.target.value })}
          placeholder="아이디"
          autoComplete="off"
          aria-label={`${account.name} 아이디`}
          className={cn(FIELD, 'mt-1')}
        />
      </label>

      {account.key === 'art09' ? (
        <label className="block">
          <span className="text-xs font-medium text-slate-600">공급사 아이디</span>
          <input
            value={draft.supplierLoginId}
            onChange={(event) => onChange({ supplierLoginId: event.target.value })}
            placeholder="공급사 아이디"
            autoComplete="off"
            aria-label={`${account.name} 공급사 아이디`}
            className={cn(FIELD, 'mt-1')}
          />
        </label>
      ) : null}

      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">비밀번호</span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            {account.hasPassword ? (
              <>
                <KeyRound size={11} className="text-emerald-500" aria-hidden />
                {account.passwordUpdatedAt
                  ? `저장됨 · ${formatDateTime(account.passwordUpdatedAt)}`
                  : '저장됨'}
              </>
            ) : (
              '미저장'
            )}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <input
            type={revealed ? 'text' : 'password'}
            value={draft.password}
            onChange={(event) => onChange({ password: event.target.value })}
            placeholder={revealing ? '저장된 비밀번호를 불러오는 중' : account.hasPassword ? '새 비밀번호' : '비밀번호'}
            autoComplete="new-password"
            aria-label={`${account.name} 비밀번호`}
            className={FIELD}
          />
          <button
            type="button"
            onClick={onToggleReveal}
            disabled={revealing || !account.hasPassword}
            aria-label={`${account.name} 비밀번호 ${revealed ? '가리기' : '보기'}`}
            aria-pressed={revealed}
            title={account.hasPassword
              ? revealed ? '가리기' : '저장된 비밀번호 보기'
              : '저장된 비밀번호가 없습니다'}
            className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 disabled:opacity-30"
          >
            {revealing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : revealed ? (
              <EyeOff size={14} />
            ) : (
              <Eye size={14} />
            )}
          </button>
        </div>
        <p className={cn('mt-1 text-[11px]', passwordChanged ? 'text-purple-700' : 'text-slate-400')}>
          {passwordChanged
            ? '저장하면 이 비밀번호로 바뀝니다.'
            : passwordLoaded
              ? '저장된 비밀번호입니다. 바꾸려면 고쳐 쓰고 저장하세요.'
              : account.hasPassword
                ? '바꾸려면 새 비밀번호를 적고 저장하세요. 비워 두면 그대로입니다.'
                : '비밀번호를 적고 저장하세요.'}
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">사이트 주소</span>
        <span className="mt-1 flex items-center gap-1.5">
          <input
            value={draft.siteUrl}
            onChange={(event) => onChange({ siteUrl: event.target.value })}
            placeholder="https://"
            aria-label={`${account.name} 사이트 주소`}
            className={FIELD}
          />
          <a
            href={draft.siteUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${account.name} 사이트 열기`}
            className={cn(
              'rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50',
              !draft.siteUrl && 'pointer-events-none opacity-30',
            )}
          >
            <ExternalLink size={14} />
          </a>
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          aria-label={`${account.name} 사용`}
          className="h-4 w-4 accent-purple-600"
        />
        이 몰 사용
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onTestLogin}
            disabled={testing || testBusy || !row.supportsCollection}
            title={row.supportsCollection
              ? '저장된 계정으로 실제 로그인해봅니다'
              : '아직 수집 파이프라인이 없는 몰입니다'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
            로그인 테스트
          </button>
          {testResult ? (
            <div
              role="status"
              className={cn(
                'mt-1 flex items-start gap-1 text-[11px]',
                testResult.outcome === 'verified' && 'text-emerald-600',
                testResult.outcome === 'unverified' && 'text-amber-600',
                (testResult.outcome === 'failed' || testResult.outcome === 'no_credentials')
                  && 'text-red-600',
              )}
            >
              {testResult.outcome === 'verified' ? (
                <CheckCircle2 size={11} className="mt-0.5 flex-none" />
              ) : testResult.outcome === 'unverified' ? (
                <AlertTriangle size={11} className="mt-0.5 flex-none" />
              ) : (
                <XCircle size={11} className="mt-0.5 flex-none" />
              )}
              <span className="line-clamp-3">
                {testResult.outcome === 'verified'
                  ? `폼 제출됨${testResult.detail ? ` · ${testResult.detail}` : ''}`
                  : testResult.outcome === 'unverified'
                    ? `확인 못 함 — ${testResult.detail}`
                    : testResult.detail}
              </span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!row.dirty || saving}
          title={row.dirty ? '이 몰 계정을 저장합니다' : '변경된 내용이 없습니다'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          저장
        </button>
      </div>
    </div>
  );
}

function CapabilityBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-medium',
        enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400',
      )}
      title={enabled ? `${label} 지원` : `${label} 준비 중`}
    >
      {label}
    </span>
  );
}
