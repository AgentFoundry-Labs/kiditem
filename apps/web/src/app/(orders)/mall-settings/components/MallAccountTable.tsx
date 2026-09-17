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
import { MALL_READINESS_LABEL } from '../lib/mall-capabilities';
import type { MallLoginTestResult } from '../hooks/use-mall-login-test';

const READINESS_TONE: Record<string, string> = {
  ready: 'bg-emerald-500',
  needs_account: 'bg-amber-400',
  paused: 'bg-slate-300',
  preparing: 'bg-slate-200',
};

interface MallAccountTableProps {
  rows: MallAccountRow[];
  testingKey: string | null;
  testResults: Record<string, MallLoginTestResult>;
  /** 눈 아이콘으로 실제 값을 펼친 몰. */
  revealedKeys: ReadonlySet<string>;
  revealingKey: string | null;
  savingKey: string | null;
  onDraftChange: (mallKey: string, patch: Partial<MallAccountRowDraft>) => void;
  onToggleReveal: (mallKey: string, mallName: string) => void;
  onSaveRow: (mallKey: string, mallName: string) => void;
  onTestLogin: (mallKey: string, mallName: string) => void;
}

export function MallAccountTable({
  rows,
  testingKey,
  testResults,
  revealedKeys,
  revealingKey,
  savingKey,
  onDraftChange,
  onToggleReveal,
  onSaveRow,
  onTestLogin,
}: MallAccountTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1080px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
            <th className="px-4 py-3">몰</th>
            <th className="px-3 py-3">아이디</th>
            <th className="px-3 py-3">비밀번호</th>
            <th className="px-3 py-3">사이트 주소</th>
            <th className="px-3 py-3">지원 기능</th>
            <th className="px-3 py-3 text-center">사용</th>
            <th className="px-3 py-3">로그인 테스트</th>
            <th className="px-3 py-3 text-center">저장</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { account, draft } = row;
            const result = testResults[account.key];
            const testing = testingKey === account.key;
            const revealed = revealedKeys.has(account.key);
            const revealing = revealingKey === account.key;
            const saving = savingKey === account.key;
            return (
              <tr
                key={account.key}
                className={cn(
                  'border-b border-slate-50 last:border-b-0 align-top',
                  row.dirty && 'bg-purple-50/40',
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('h-1.5 w-1.5 flex-none rounded-full', READINESS_TONE[row.readiness])}
                      title={MALL_READINESS_LABEL[row.readiness]}
                    />
                    <span className="font-medium text-slate-900">{account.name}</span>
                    {row.dirty ? (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                        변경됨
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 pl-3.5 text-[11px] text-slate-400">
                    {MALL_READINESS_LABEL[row.readiness]}
                  </div>
                </td>

                <td className="px-3 py-3">
                  <input
                    value={draft.loginId}
                    onChange={(event) => onDraftChange(account.key, { loginId: event.target.value })}
                    placeholder="아이디"
                    autoComplete="off"
                    aria-label={`${account.name} 아이디`}
                    className="w-36 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-purple-400"
                  />
                  {account.key === 'art09' ? (
                    <input
                      value={draft.supplierLoginId}
                      onChange={(event) =>
                        onDraftChange(account.key, { supplierLoginId: event.target.value })}
                      placeholder="공급사 아이디"
                      autoComplete="off"
                      aria-label={`${account.name} 공급사 아이디`}
                      className="mt-1 w-36 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-purple-400"
                    />
                  ) : null}
                </td>

                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <input
                      type={revealed ? 'text' : 'password'}
                      value={draft.password}
                      onChange={(event) =>
                        onDraftChange(account.key, { password: event.target.value })}
                      placeholder={account.hasPassword ? '••••••••' : '비밀번호'}
                      autoComplete="new-password"
                      aria-label={`${account.name} 비밀번호`}
                      className="w-36 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-purple-400"
                    />
                    <button
                      type="button"
                      onClick={() => onToggleReveal(account.key, account.name)}
                      disabled={revealing || !account.hasPassword}
                      aria-label={`${account.name} 비밀번호 ${revealed ? '가리기' : '보기'}`}
                      aria-pressed={revealed}
                      title={account.hasPassword
                        ? revealed ? '가리기' : '저장된 비밀번호 보기'
                        : '저장된 비밀번호가 없습니다'}
                      className="rounded-md border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 disabled:opacity-30"
                    >
                      {revealing ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : revealed ? (
                        <EyeOff size={13} />
                      ) : (
                        <Eye size={13} />
                      )}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    {account.hasPassword ? (
                      <>
                        <KeyRound size={11} className="text-emerald-500" />
                        {account.passwordUpdatedAt
                          ? `저장됨 · ${formatDateTime(account.passwordUpdatedAt)}`
                          : '저장됨'}
                      </>
                    ) : (
                      '미저장'
                    )}
                  </div>
                </td>

                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <input
                      value={draft.siteUrl}
                      onChange={(event) => onDraftChange(account.key, { siteUrl: event.target.value })}
                      placeholder="https://"
                      aria-label={`${account.name} 사이트 주소`}
                      className="w-56 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-purple-400"
                    />
                    <a
                      href={draft.siteUrl || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${account.name} 사이트 열기`}
                      className={cn(
                        'rounded-md border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50',
                        !draft.siteUrl && 'pointer-events-none opacity-30',
                      )}
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </td>

                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    <CapabilityBadge label="주문수집" enabled={row.supportsCollection} />
                    <CapabilityBadge label="송장등록" enabled={row.supportsTracking} />
                  </div>
                </td>

                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => onDraftChange(account.key, { enabled: event.target.checked })}
                    aria-label={`${account.name} 사용`}
                    className="h-4 w-4 accent-purple-600"
                  />
                </td>

                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onTestLogin(account.key, account.name)}
                    disabled={testing || testingKey !== null || !row.supportsCollection}
                    title={row.supportsCollection
                      ? '저장된 계정으로 실제 로그인해봅니다'
                      : '아직 수집 파이프라인이 없는 몰입니다'}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {testing ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                    테스트
                  </button>
                  {result ? (
                    <div
                      className={cn(
                        'mt-1 flex items-start gap-1 text-[11px]',
                        result.outcome === 'verified' && 'text-emerald-600',
                        result.outcome === 'unverified' && 'text-amber-600',
                        (result.outcome === 'failed' || result.outcome === 'no_credentials')
                          && 'text-red-600',
                      )}
                    >
                      {result.outcome === 'verified' ? (
                        <CheckCircle2 size={11} className="mt-0.5 flex-none" />
                      ) : result.outcome === 'unverified' ? (
                        <AlertTriangle size={11} className="mt-0.5 flex-none" />
                      ) : (
                        <XCircle size={11} className="mt-0.5 flex-none" />
                      )}
                      <span className="line-clamp-3">
                        {result.outcome === 'verified'
                          ? `폼 제출됨${result.detail ? ` · ${result.detail}` : ''}`
                          : result.outcome === 'unverified'
                            ? `확인 못 함 — ${result.detail}`
                            : result.detail}
                      </span>
                    </div>
                  ) : null}
                </td>

                <td className="px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => onSaveRow(account.key, account.name)}
                    disabled={!row.dirty || saving || savingKey !== null}
                    title={row.dirty ? '이 몰만 저장합니다' : '변경된 내용이 없습니다'}
                    className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {saving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    저장
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
