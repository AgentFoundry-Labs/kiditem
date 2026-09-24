'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from '@/lib/order-mall-account-api';
import { moveMallKey, reorderMallKeys } from '../lib/mall-order';
import { friendlyError } from '@/lib/api-error';

interface UseMallOrderDragOptions {
  mallAccounts: OrderCollectionMallAccount[];
  /** 저장 후 서버 순서를 다시 읽어오기 위한 목록 새로고침. */
  onSaved: () => void;
}

/**
 * 주문수집 카드 순서 — 편집 모드 없이 손잡이를 끌면 곧바로 저장한다.
 *
 * 서버 응답을 기다리는 동안 화면이 튀지 않도록 새 순서를 먼저 그려두고,
 * 저장이 실패하면 서버 순서로 되돌린다.
 */
export function useMallOrderDrag({ mallAccounts, onSaved }: UseMallOrderDragOptions) {
  const [pendingKeys, setPendingKeys] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const accounts = useMemo(() => {
    if (!pendingKeys) return mallAccounts;
    const byKey = new Map(mallAccounts.map((account) => [account.key, account]));
    const ordered = pendingKeys.flatMap((key) => {
      const account = byKey.get(key);
      return account ? [account] : [];
    });
    // 저장 대기 중에 몰이 새로 늘면 뒤에 붙여 빠지는 카드가 없게 한다.
    const placed = new Set(pendingKeys);
    return [...ordered, ...mallAccounts.filter((account) => !placed.has(account.key))];
  }, [mallAccounts, pendingKeys]);

  // 서버가 같은 순서를 돌려주면 임시 순서를 놓아준다.
  useEffect(() => {
    if (!pendingKeys) return;
    const serverKeys = mallAccounts.map((account) => account.key);
    if (serverKeys.join(' ') === pendingKeys.join(' ')) setPendingKeys(null);
  }, [mallAccounts, pendingKeys]);

  const persist = useCallback(
    async (nextKeys: string[], currentKeys: string[]) => {
      if (nextKeys.join(' ') === currentKeys.join(' ')) return;
      setPendingKeys(nextKeys);
      setSaving(true);
      try {
        const saved = await orderMallAccountApi.reorder(nextKeys);
        // 계정 행이 없는 몰은 순서가 저장되지 않아 서버 순서가 끈 순서와 다를 수 있다.
        // 서버가 돌려준 순서로 자리를 잡아야 새로고침 전후 화면이 같다.
        setPendingKeys(saved.map((account) => account.key));
        onSaved();
      } catch (error) {
        setPendingKeys(null);
        toast.error(
          friendlyError(error, '순서를 저장하지 못했습니다.'),
        );
      } finally {
        setSaving(false);
      }
    },
    [onSaved],
  );

  const drop = useCallback(
    (sourceKey: string, targetKey: string) => {
      const currentKeys = accounts.map((account) => account.key);
      void persist(reorderMallKeys(currentKeys, sourceKey, targetKey), currentKeys);
    },
    [accounts, persist],
  );

  /** 손잡이에 포커스를 두고 방향키로도 옮길 수 있게 한다. */
  const move = useCallback(
    (mallKey: string, direction: -1 | 1) => {
      const currentKeys = accounts.map((account) => account.key);
      void persist(moveMallKey(currentKeys, mallKey, direction), currentKeys);
    },
    [accounts, persist],
  );

  return { accounts, saving, drop, move };
}
