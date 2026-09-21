'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw, Save, Store } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { orderMallAccountApi } from '@/lib/order-mall-account-api';
import { MallAccountTable } from './components/MallAccountTable';
import { useMallLoginTest } from './hooks/use-mall-login-test';
import {
  buildMallAccountRows,
  summarizeMallAccountRows,
  updateInputFromDraft,
  type MallAccountRowDraft,
} from './lib/mall-account-rows';

export default function MallSettingsPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, MallAccountRowDraft>>({});
  const [revealedKeys, setRevealedKeys] = useState<ReadonlySet<string>>(new Set());
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const loginTest = useMallLoginTest();

  const mallsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: orderMallAccountApi.list,
  });
  const accounts = useMemo(() => mallsQuery.data ?? [], [mallsQuery.data]);
  const rows = useMemo(() => buildMallAccountRows(accounts, drafts), [accounts, drafts]);
  const summary = useMemo(() => summarizeMallAccountRows(rows), [rows]);

  const handleDraftChange = useCallback(
    (mallKey: string, patch: Partial<MallAccountRowDraft>) => {
      setDrafts((current) => {
        const account = accounts.find((candidate) => candidate.key === mallKey);
        if (!account) return current;
        const base = current[mallKey] ?? {
          loginId: account.loginId ?? '',
          supplierLoginId: account.supplierLoginId ?? '',
          password: '',
          siteUrl: account.siteUrl ?? '',
          memo: account.memo ?? '',
          enabled: account.enabled,
        };
        return { ...current, [mallKey]: { ...base, ...patch } };
      });
    },
    [accounts],
  );

  /**
   * 저장된 비밀번호는 눈 아이콘을 누른 그 몰만 그때 불러온다. 표를 열었다고
   * 27개를 미리 받아두지 않는다. 불러온 값은 초안에 넣되 seed 로도 남겨,
   * 보기만 한 것을 변경으로 세지 않는다.
   */
  const handleToggleReveal = useCallback(
    async (mallKey: string, mallName: string) => {
      if (revealedKeys.has(mallKey)) {
        setRevealedKeys((current) => {
          const next = new Set(current);
          next.delete(mallKey);
          return next;
        });
        return;
      }
      setRevealingKey(mallKey);
      try {
        const { password } = await orderMallAccountApi.password(mallKey);
        if (!password) {
          toast.warning(`${mallName} 저장된 비밀번호가 없습니다.`);
          return;
        }
        handleDraftChange(mallKey, { password, seededPassword: password });
        setRevealedKeys((current) => new Set(current).add(mallKey));
      } catch (error) {
        toast.error(
          isApiError(error) ? error.detail : `${mallName} 비밀번호를 불러오지 못했습니다.`,
        );
      } finally {
        setRevealingKey(null);
      }
    },
    [handleDraftChange, revealedKeys],
  );

  const clearDraft = useCallback((mallKey: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[mallKey];
      return next;
    });
    setRevealedKeys((current) => {
      const next = new Set(current);
      next.delete(mallKey);
      return next;
    });
  }, []);

  const handleSaveRow = useCallback(
    async (mallKey: string, mallName: string) => {
      const row = rows.find((candidate) => candidate.account.key === mallKey);
      if (!row?.dirty) return;
      setSavingKey(mallKey);
      try {
        await orderMallAccountApi.update(mallKey, updateInputFromDraft(row.draft));
        clearDraft(mallKey);
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
        toast.success(`${mallName} 저장했습니다.`);
      } catch (error) {
        toast.error(isApiError(error) ? error.detail : `${mallName} 저장하지 못했습니다.`);
      } finally {
        setSavingKey(null);
      }
    },
    [clearDraft, queryClient, rows],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dirty = rows.filter((row) => row.dirty);
      // 몰마다 독립된 자격증명이라 한 몰이 실패해도 나머지는 저장한다.
      const outcomes = await Promise.allSettled(
        dirty.map((row) =>
          orderMallAccountApi.update(row.account.key, updateInputFromDraft(row.draft))),
      );
      const failed = outcomes.flatMap((outcome, index) =>
        outcome.status === 'rejected' ? [dirty[index]!.account.name] : []);
      return { saved: dirty.length - failed.length, failed };
    },
    onSuccess: ({ saved, failed }) => {
      setDrafts({});
      setRevealedKeys(new Set());
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
      if (failed.length === 0) {
        toast.success(`${formatNumber(saved)}개 몰을 저장했습니다.`);
        return;
      }
      toast.error(`${failed.length}개 몰을 저장하지 못했습니다.`, {
        description: failed.join(', '),
      });
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.detail : '몰 설정을 저장하지 못했습니다.');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Store className="h-6 w-6 text-slate-600" />
            쇼핑몰 계정
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            주문수집·송장등록·상품등록에 쓰는 쇼핑몰 계정을 한 곳에서 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void mallsQuery.refetch()}
            disabled={mallsQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={mallsQuery.isFetching ? 'animate-spin' : ''} />
            새로고침
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={summary.dirty === 0 || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            변경사항 저장{summary.dirty > 0 ? ` (${formatNumber(summary.dirty)})` : ''}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="전체 몰" value={summary.total} />
        <SummaryCard label="사용 중" value={summary.ready} tone="emerald" />
        <SummaryCard label="계정 필요" value={summary.needsAccount} tone="amber" />
        <SummaryCard label="준비 중" value={summary.preparing} tone="slate" />
      </div>

      {mallsQuery.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-5 text-sm text-red-600">
          <AlertCircle size={15} />
          {isApiError(mallsQuery.error) ? mallsQuery.error.detail : '몰 목록을 불러오지 못했습니다.'}
        </div>
      ) : mallsQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-5 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" />
          불러오는 중
        </div>
      ) : (
        <MallAccountTable
          rows={rows}
          testingKey={loginTest.testingKey}
          testResults={loginTest.results}
          revealedKeys={revealedKeys}
          revealingKey={revealingKey}
          savingKey={savingKey}
          onDraftChange={handleDraftChange}
          onToggleReveal={(mallKey, mallName) => void handleToggleReveal(mallKey, mallName)}
          onSaveRow={(mallKey, mallName) => void handleSaveRow(mallKey, mallName)}
          onTestLogin={(mallKey, mallName) => void loginTest.test(mallKey, mallName)}
        />
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>참고:</strong> 비밀번호는 눈 아이콘을 누른 몰만 그때 불러옵니다. 보기만 한
        것은 변경으로 세지 않고, 비워두면 기존 비밀번호가 그대로 유지됩니다. 행마다
        <strong> 저장</strong>으로 한 몰씩, 위쪽 <strong>변경사항 저장</strong>으로 여러 몰을
        한 번에 저장할 수 있습니다. 로그인 테스트는 주문수집 확장프로그램이 설치·로그인된
        브라우저에서만 동작합니다.
      </div>
    </div>
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
