'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canReadMallAvailability,
  readMallAvailabilityMany,
  summarizeLiveAvailability,
  type MallLiveSummary,
} from '../../_shared/mall-availability-send';
import type { MallListingMatrixColumn, MallListingMatrixRow } from '@kiditem/shared/mall-publishing';
import { friendlyError } from '@/lib/api-error';

/** 칸 하나의 몰 지금 재고. 읽는 중 · 읽음 · 못 읽음. */
export type MallLiveCell =
  | { status: 'loading' }
  | { status: 'ready'; summary: MallLiveSummary; readAt: Date }
  | { status: 'error'; message: string };

export interface MallLiveAvailability {
  /** `${mallKey}:${몰 상품번호}` → 지금 재고. 읽을 수 없는 몰의 칸은 없다. */
  cells: ReadonlyMap<string, MallLiveCell>;
  /** 칸 하나를 몰에서 다시 읽는다(품절 · 재개를 보낸 뒤). */
  refresh: (mallKey: string, mallProductCode: string) => Promise<void>;
}

export function liveCellKey(mallKey: string, mallProductCode: string) {
  return `${mallKey}:${mallProductCode}`;
}

/**
 * 등록현황 한 페이지의 몰 지금 재고.
 *
 * 쿠팡 윙은 품절(재고 0)이어도 판매상태가 판매중(ON_SALE)이라, 가져온 상태만으로는 칸이 늘 '등록'이다. 페이지가
 * 뜨면 그 페이지의 쿠팡 칸을 윙에서 한 번에 읽어 품절이면 품절로 보인다(사장님 2026-09-18: "실시간으로 품절이면
 * 품절로 나오게 해줘야지 … 품절은 빨간색으로"). 읽기만 한다. 값은 이 화면에만 있다 — 저장하지 않는다.
 *
 * 읽기 하나 = 판매 상태 읽기 실행(`channels.mall_availability_read`) 하나(KID-364). 주기와 동시 수는 옛 훅 그대로다 —
 * 페이지가 바뀔 때 한 번, 읽을 수 있는 몰 열마다 동시에 하나. 읽기 폴링 예산: 실행마다 끝날 때까지 3초에 한 번
 * `GET /api/operations/:id`(분당 20회)라 최악은 읽는 몰 15곳 × 20 = 분당 300회(탭 하나), API 제한 분당 600회 안이다.
 * 끝난 실행은 더 읽지 않고, 칸 하나 다시 읽기는 그 몰 실행 하나를 더한다.
 */
export function useMallLiveAvailability(
  columns: readonly MallListingMatrixColumn[],
  rows: readonly MallListingMatrixRow[],
): MallLiveAvailability {
  const [cells, setCells] = useState<ReadonlyMap<string, MallLiveCell>>(new Map());

  // 몰마다 이 페이지에서 읽을 상품번호. 몰에 올라가 있는 칸만 읽는다.
  const targets = useMemo(() => {
    const readable = columns.filter((column) => canReadMallAvailability(column.mallKey) && column.channelAccountId);
    return readable.flatMap((column) => {
      const codes = [...new Set(rows.flatMap((row) => {
        const cell = row.cells.find((candidate) => candidate.mallKey === column.mallKey);
        return cell?.externalId && cell.state === 'published' ? [cell.externalId] : [];
      }))];
      return codes.length > 0 ? [{ mallKey: column.mallKey, channelAccountId: column.channelAccountId!, codes }] : [];
    });
  }, [columns, rows]);
  const accountByMall = useMemo(
    () => new Map(columns.flatMap((column) => (column.channelAccountId ? [[column.mallKey, column.channelAccountId] as const] : []))),
    [columns],
  );
  const targetKey = targets.map((target) => `${target.mallKey}=${target.codes.join(',')}`).join('|');

  const put = useCallback((entries: ReadonlyArray<[string, MallLiveCell]>) => {
    setCells((current) => {
      const next = new Map(current);
      for (const [key, value] of entries) next.set(key, value);
      return next;
    });
  }, []);

  // 페이지가 바뀌면 그 페이지만 새로 읽는다. 늦게 온 옛 페이지 결과는 버린다.
  const generation = useRef(0);
  useEffect(() => {
    if (targets.length === 0) return;
    const current = ++generation.current;
    for (const target of targets) {
      put(target.codes.map((code) => [liveCellKey(target.mallKey, code), { status: 'loading' }]));
      // 화면이 스스로 읽는다 — 자동 로그인은 한 시간에 한 번만 싣는다(계정 잠금 방지).
      void readMallAvailabilityMany({
        mallKey: target.mallKey, channelAccountId: target.channelAccountId, codes: target.codes, automatic: true,
      }).then(
        (products) => {
          if (generation.current !== current) return;
          const readAt = new Date();
          put(target.codes.map((code) => {
            const options = products.get(code);
            return [liveCellKey(target.mallKey, code), options
              ? { status: 'ready', summary: summarizeLiveAvailability(options, target.mallKey), readAt }
              : { status: 'error', message: '이 상품을 몰에서 찾지 못했습니다.' }];
          }));
        },
        (error: unknown) => {
          if (generation.current !== current) return;
          const message = friendlyError(error, '지금 재고를 읽지 못했습니다.') ?? '지금 재고를 읽지 못했습니다.';
          put(target.codes.map((code) => [liveCellKey(target.mallKey, code), { status: 'error', message }]));
        },
      );
    }
    // targetKey 가 곧 targets 의 내용이다 — 행 객체가 새로 만들어져도 같은 페이지면 다시 읽지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, put]);

  const refresh = useCallback(async (mallKey: string, mallProductCode: string) => {
    const key = liveCellKey(mallKey, mallProductCode);
    const channelAccountId = accountByMall.get(mallKey);
    if (!channelAccountId) {
      put([[key, { status: 'error', message: '이 몰 계정을 확인하지 못했습니다.' }]]);
      return;
    }
    put([[key, { status: 'loading' }]]);
    try {
      const products = await readMallAvailabilityMany({ mallKey, channelAccountId, codes: [mallProductCode] });
      const options = products.get(mallProductCode);
      put([[key, options
        ? { status: 'ready', summary: summarizeLiveAvailability(options, mallKey), readAt: new Date() }
        : { status: 'error', message: '이 상품을 몰에서 찾지 못했습니다.' }]]);
    } catch (error) {
      put([[key, { status: 'error', message: friendlyError(error, '지금 재고를 읽지 못했습니다.') ?? '지금 재고를 읽지 못했습니다.' }]]);
    }
  }, [accountByMall, put]);

  return { cells, refresh };
}
