'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { orderMallAccountApi } from '../../order-collection/lib/order-mall-account-api';
import {
  buildMallAccountRows,
  summarizeMallAccountRows,
  updateInputFromDraft,
  type MallAccountRowDraft,
} from '../lib/mall-account-rows';
import { useMallLoginTest } from './use-mall-login-test';

/**
 * 쇼핑몰 계정 편집 상태 — 몰마다 초안 · 저장된 비밀번호 보기 · 한 몰 저장 · 여러 몰 저장 · 로그인 테스트.
 *
 * 계정 행의 유일한 작성자는 Orders 쇼핑몰 계정 API 다(ADR-0012). 쇼핑몰 현황이 이 편집을 모달로 연다(사장님
 * 2026-09-19 "쇼핑몰계정 페이지를 쇼핑몰 현황으로 넣어서 합쳐줘라 … 모달로").
 */
export function useMallAccountEditor() {
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

  const changeDraft = useCallback(
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
   * 저장된 비밀번호는 눈 아이콘을 누른 그 몰만 그때 불러온다. 목록을 열었다고 미리 받아두지 않는다. 불러온 값은
   * 초안에 넣되 seed 로도 남겨, 보기만 한 것을 변경으로 세지 않는다.
   */
  const toggleReveal = useCallback(
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
        changeDraft(mallKey, { password, seededPassword: password });
        setRevealedKeys((current) => new Set(current).add(mallKey));
      } catch (error) {
        toast.error(
          isApiError(error) ? error.detail : `${mallName} 비밀번호를 불러오지 못했습니다.`,
        );
      } finally {
        setRevealingKey(null);
      }
    },
    [changeDraft, revealedKeys],
  );

  /** 저장한 몰의 초안과 펼친 비밀번호를 버린다. 창을 닫으면 편집 전체가 사라지므로 따로 부르지 않는다. */
  const discard = useCallback((mallKey: string) => {
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

  const saveRow = useCallback(
    async (mallKey: string, mallName: string): Promise<boolean> => {
      const row = rows.find((candidate) => candidate.account.key === mallKey);
      if (!row?.dirty) return false;
      setSavingKey(mallKey);
      try {
        await orderMallAccountApi.update(mallKey, updateInputFromDraft(row.draft));
        discard(mallKey);
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
        toast.success(`${mallName} 저장했습니다.`);
        return true;
      } catch (error) {
        toast.error(isApiError(error) ? error.detail : `${mallName} 저장하지 못했습니다.`);
        return false;
      } finally {
        setSavingKey(null);
      }
    },
    [discard, queryClient, rows],
  );

  const saveAll = useMutation({
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

  return {
    mallsQuery,
    rows,
    summary,
    revealedKeys,
    revealingKey,
    savingKey,
    loginTest,
    changeDraft,
    toggleReveal,
    saveRow,
    saveAll,
  };
}

export type MallAccountEditor = ReturnType<typeof useMallAccountEditor>;
