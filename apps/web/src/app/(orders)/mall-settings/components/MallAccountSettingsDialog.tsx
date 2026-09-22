'use client';

import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Loader2, Save, X } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { cn, formatNumber } from '@/lib/utils';
import { useMallAccountEditor } from '../hooks/use-mall-account-editor';
import { MallAccountForm } from './MallAccountForm';
import { MallAccountTable } from './MallAccountTable';

/** 창이 여는 대상 — 몰 계정 키 하나, 또는 모든 몰(`all`). */
export type MallAccountSettingsTarget = string | 'all';

/**
 * 쇼핑몰 계정 설정 창 — 쇼핑몰 현황이 연다(사장님 2026-09-19 "쇼핑몰계정 페이지를 쇼핑몰 현황으로 넣어서 합쳐줘라
 * 설정으로 해서 모달로 … 비번 변경은?"). 몰 하나는 그 몰의 아이디 · 비밀번호(보기 · 변경) · 사이트 주소 · 사용 ·
 * 로그인 테스트, `all` 은 예전 쇼핑몰 계정 화면의 표 전체다. 몰 하나의 창은 저장된 비밀번호를 열자마자 보인다
 * (사장님 2026-09-19 "기존 비밀번호 보이게 해줘야지") — 표는 27개를 한꺼번에 받지 않도록 눈 아이콘을 누른 몰만이다.
 * 편집은 창이 열린 동안만 살고, 닫으면 저장하지 않은 초안은 버린다.
 */
export function MallAccountSettingsDialog({
  target,
  mallName,
  onClose,
}: {
  target: MallAccountSettingsTarget | null;
  /** 계정 목록을 받기 전 제목에 쓸 몰 이름. */
  mallName?: string;
  onClose: () => void;
}) {
  const all = target === 'all';
  return (
    <Dialog.Root open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/35" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[140] flex max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-slate-200 bg-white shadow-xl',
            all ? 'w-[min(1320px,calc(100vw-32px))]' : 'w-[min(480px,calc(100vw-32px))]',
          )}
        >
          {target !== null ? <SettingsBody target={target} mallName={mallName} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsBody({
  target,
  mallName,
}: {
  target: MallAccountSettingsTarget;
  mallName?: string;
}) {
  const editor = useMallAccountEditor();
  const { mallsQuery, rows, summary, reveal } = editor;
  const row = target === 'all' ? null : rows.find((candidate) => candidate.account.key === target) ?? null;
  const title = target === 'all' ? '쇼핑몰 계정' : `${row?.account.name ?? mallName ?? '몰'} 계정 설정`;

  // 저장된 비밀번호는 창을 열 때 한 번, 저장해 계정이 바뀌면 다시 한 번 불러온다. 못 불러와도 되풀이하지 않고,
  // 눈으로 가린 것 · 고쳐 쓰는 중인 것은 건드리지 않는다.
  const revealedRevision = useRef<string | null>(null);
  const revision = row?.account.hasPassword
    ? `${row.account.key}|${row.account.updatedAt ?? ''}|${row.account.passwordUpdatedAt ?? ''}`
    : null;
  const untouched = row ? row.draft.seededPassword === undefined && row.draft.password === '' : false;
  useEffect(() => {
    if (!row || revision === null || !untouched || revealedRevision.current === revision) return;
    revealedRevision.current = revision;
    void reveal(row.account.key, row.account.name);
  }, [reveal, revision, row, untouched]);

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <Dialog.Title className="text-sm font-semibold text-slate-900">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-slate-500">
            {target === 'all'
              ? '주문수집 · 송장등록 · 상품등록에 쓰는 쇼핑몰 계정입니다.'
              : '아이디 · 비밀번호 · 사이트 주소를 바꾸고 로그인을 시험합니다.'}
          </Dialog.Description>
        </div>
        <div className="flex items-center gap-2">
          {target === 'all' ? (
            <button
              type="button"
              onClick={() => editor.saveAll.mutate()}
              disabled={summary.dirty === 0 || editor.saveAll.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editor.saveAll.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              변경사항 저장{summary.dirty > 0 ? ` (${formatNumber(summary.dirty)})` : ''}
            </button>
          ) : null}
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="닫기"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </Dialog.Close>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {mallsQuery.isError ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-600">
            <AlertCircle size={15} />
            {isApiError(mallsQuery.error) ? mallsQuery.error.detail : '몰 계정을 불러오지 못했습니다.'}
          </div>
        ) : mallsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" />
            불러오는 중
          </div>
        ) : target === 'all' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label="전체 몰" value={summary.total} />
              <SummaryCard label="사용 중" value={summary.ready} tone="emerald" />
              <SummaryCard label="계정 필요" value={summary.needsAccount} tone="amber" />
              <SummaryCard label="준비 중" value={summary.preparing} tone="slate" />
            </div>
            <MallAccountTable
              rows={rows}
              testingKey={editor.loginTest.testingKey}
              testResults={editor.loginTest.results}
              revealedKeys={editor.revealedKeys}
              revealingKey={editor.revealingKey}
              savingKey={editor.savingKey}
              onDraftChange={editor.changeDraft}
              onToggleReveal={(mallKey, name) => void editor.toggleReveal(mallKey, name)}
              onSaveRow={(mallKey, name) => void editor.saveRow(mallKey, name)}
              onTestLogin={(mallKey, name) => void editor.loginTest.test(mallKey, name)}
            />
            <p className="text-xs text-slate-500">
              비밀번호는 눈 아이콘을 누른 몰만 그때 불러옵니다. 보기만 한 것은 변경으로 세지 않고, 비워두면 기존
              비밀번호가 그대로 유지됩니다. 로그인 테스트는 주문수집 확장프로그램이 설치 · 로그인된 브라우저에서만
              동작합니다.
            </p>
          </div>
        ) : row ? (
          <MallAccountForm
            row={row}
            revealed={editor.revealedKeys.has(row.account.key)}
            revealing={editor.revealingKey === row.account.key}
            saving={editor.savingKey === row.account.key}
            testing={editor.loginTest.testingKey === row.account.key}
            testBusy={editor.loginTest.testingKey !== null}
            testResult={editor.loginTest.results[row.account.key]}
            onChange={(patch) => editor.changeDraft(row.account.key, patch)}
            onToggleReveal={() => void editor.toggleReveal(row.account.key, row.account.name)}
            onSave={() => void editor.saveRow(row.account.key, row.account.name)}
            onTestLogin={() => void editor.loginTest.test(row.account.key, row.account.name)}
          />
        ) : (
          <p className="text-sm text-slate-500">
            이 몰은 쇼핑몰 계정 목록에 없습니다 — 계정을 저장할 수 있는 몰은 주문수집이 아는 몰뿐입니다.
          </p>
        )}
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'emerald' | 'amber' | 'slate';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'emerald' && 'text-emerald-600',
          tone === 'amber' && 'text-amber-600',
          tone === 'slate' && 'text-slate-400',
          tone === 'default' && 'text-slate-900',
        )}
      >
        {formatNumber(value)}
      </div>
    </div>
  );
}
