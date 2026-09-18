'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MallListingMatrixColumn, MallListingMatrixRow } from '@kiditem/shared/mall-publishing';
import {
  canReadMallAvailability,
  readMallAvailabilityMany,
  summarizeLiveAvailability,
  type MallLiveSummary,
} from '../../_shared/mall-availability-send';

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
  /**
   * 확장이 보낸 뒤 몰을 다시 읽어 확인한 상태를 칸에 그대로 둔다 — 조회가 늦게 따라오는 몰(롯데ON)은 바로 다시 읽으면
   * 옛 값을 받는다.
   */
  settle: (mallKey: string, mallProductCode: string, soldOut: boolean) => void;
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
 */
export function useMallLiveAvailability(
  columns: readonly MallListingMatrixColumn[],
  rows: readonly MallListingMatrixRow[],
): MallLiveAvailability {
  const [cells, setCells] = useState<ReadonlyMap<string, MallLiveCell>>(new Map());

  // 몰마다 이 페이지에서 읽을 상품번호. 몰에 올라가 있는 칸만 읽는다.
  const targets = useMemo(() => {
    const readable = columns.filter((column) => canReadMallAvailability(column.mallKey));
    return readable.flatMap((column) => {
      const codes = [...new Set(rows.flatMap((row) => {
        const cell = row.cells.find((candidate) => candidate.mallKey === column.mallKey);
        return cell?.externalId && cell.state === 'published' ? [cell.externalId] : [];
      }))];
      return codes.length > 0 ? [{ mallKey: column.mallKey, codes }] : [];
    });
  }, [columns, rows]);
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
      void readMallAvailabilityMany(target.mallKey, target.codes).then(
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
          const message = error instanceof Error ? error.message : '지금 재고를 읽지 못했습니다.';
          put(target.codes.map((code) => [liveCellKey(target.mallKey, code), { status: 'error', message }]));
        },
      );
    }
    // targetKey 가 곧 targets 의 내용이다 — 행 객체가 새로 만들어져도 같은 페이지면 다시 읽지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, put]);

  const refresh = useCallback(async (mallKey: string, mallProductCode: string) => {
    const key = liveCellKey(mallKey, mallProductCode);
    put([[key, { status: 'loading' }]]);
    try {
      const products = await readMallAvailabilityMany(mallKey, [mallProductCode]);
      const options = products.get(mallProductCode);
      put([[key, options
        ? { status: 'ready', summary: summarizeLiveAvailability(options, mallKey), readAt: new Date() }
        : { status: 'error', message: '이 상품을 몰에서 찾지 못했습니다.' }]]);
    } catch (error) {
      put([[key, { status: 'error', message: error instanceof Error ? error.message : '지금 재고를 읽지 못했습니다.' }]]);
    }
  }, [put]);

  const settle = useCallback((mallKey: string, mallProductCode: string, soldOut: boolean) => {
    const summary = summarizeLiveAvailability([{ optionCode: mallProductCode, stock: soldOut ? 0 : null, rocket: false }], mallKey);
    put([[liveCellKey(mallKey, mallProductCode), { status: 'ready', summary, readAt: new Date() }]]);
  }, [put]);

  return { cells, refresh, settle };
}
