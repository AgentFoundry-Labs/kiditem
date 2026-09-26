'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import type { CoupangDirectData, CoupangDirectPo } from '../lib/coupang-directship-api';
import type { CoupangDirectshipSelection } from '../lib/coupang-directship-collection';
import { readCoupangDirectSnapshot } from '../lib/coupang-directship-snapshot-api';
import type { OrderCollectionExtensionRun } from '../lib/order-collection-extension';

export type CoupangDirectshipCalendarState = {
  account: OrderCollectionMallAccount;
  /** 달력이 보여 주는 캡처를 보관한 성공한 실행(보기용). 변환은 수집 때 새로 연 실행으로 보낸다. 없으면 아직 수집분이 없다. */
  operationId: string | null;
  collectedAt: string | null;
  pos: CoupangDirectPo[];
  /** 이 화면에서 새로 불러온 캡처 전체(센터 포함). 서버 달력에서 연 경우는 없다. */
  data: CoupangDirectData | null;
  /** 운영자가 시작해 아직 캡처 중인 실행. 닫으면 이 실행을 멈춘다. */
  run: OrderCollectionExtensionRun | null;
  loading: boolean;
  refreshing: boolean;
};

type CalendarSessionControls = {
  prepareDirectRun: (account: OrderCollectionMallAccount) => Promise<OrderCollectionExtensionRun>;
  cancelRun: (account: OrderCollectionMallAccount) => Promise<boolean>;
  releaseRun: (mallKey: string, attemptId?: string) => void;
  failRunUnlessStopped: (run: OrderCollectionExtensionRun, code: string, message: string) => Promise<boolean>;
  syncRun: (attemptId: string) => Promise<unknown>;
};

/**
 * 쿠팡직배송 입고예정일 달력(KID-198). 여는 것은 그 계정의 마지막 성공한 수집분을 서버에서 읽기만 한다 — 실행을
 * 시작하지 않는다. 실행은 운영자가 "불러오기"(`refresh`)나 "선택한 날짜 수집"(`collect`)을 누를 때 하나 시작하고,
 * 변환은 늘 그 새 실행의 ID로 보낸다(보이는 캡처의 실행으로는 보내지 않는다).
 */
export function useCoupangDirectshipCalendar({
  channelAccountId,
  sessionControls,
  collect,
  alreadyRunning,
}: {
  channelAccountId: string | null;
  sessionControls: CalendarSessionControls;
  /** 고른 날짜를 그 실행으로 변환한다(화면의 직배송 수집 절차). */
  collect: (account: OrderCollectionMallAccount, operationId: string, selection: CoupangDirectshipSelection) => Promise<void>;
  /** 이미 도는 직배송 수집이면 안내만 하고 true. */
  alreadyRunning: (error: unknown) => boolean;
}) {
  const [calendar, setCalendarState] = useState<CoupangDirectshipCalendarState | null>(null);
  const calendarRef = useRef<CoupangDirectshipCalendarState | null>(null);
  const setCalendar = useCallback((
    next: CoupangDirectshipCalendarState | null
      | ((current: CoupangDirectshipCalendarState | null) => CoupangDirectshipCalendarState | null),
  ) => {
    const value = typeof next === 'function' ? next(calendarRef.current) : next;
    calendarRef.current = value;
    setCalendarState(value);
  }, []);

  const open = useCallback(async (account: OrderCollectionMallAccount) => {
    setCalendar({ account, operationId: null, collectedAt: null, pos: [], data: null, run: null, loading: true, refreshing: false });
    if (!channelAccountId) {
      setCalendar((current) => (current?.account === account ? { ...current, loading: false } : current));
      return;
    }
    try {
      const snapshot = await readCoupangDirectSnapshot(channelAccountId);
      setCalendar((current) => (current?.account === account && current.loading
        ? { ...current, ...snapshot, loading: false }
        : current));
    } catch (error) {
      setCalendar((current) => (current?.account === account ? { ...current, loading: false } : current));
      toast.error(friendlyError(error) ?? '쿠팡직배송 발주를 읽지 못했습니다.');
    }
  }, [channelAccountId, setCalendar]);

  /**
   * 쿠팡에서 발주를 새로 받는다: 실행 하나를 시작하고 캡처가 끝나기를 기다렸다가 달력을 그 캡처로 바꾼다. 성공하면 새
   * 실행 ID와 캡처, 실패·중단·닫힘이면 null(마지막 수집분은 그대로 보인다).
   */
  const captureAnew = useCallback(async (): Promise<{ operationId: string; data: CoupangDirectData } | null> => {
    const current = calendarRef.current;
    if (!current || current.refreshing) return null;
    const { account } = current;
    setCalendar({ ...current, refreshing: true });
    let run: OrderCollectionExtensionRun | null = null;
    const stillShowing = (attemptId: string | null) => (value: CoupangDirectshipCalendarState | null) =>
      value?.account === account && value.refreshing && (attemptId === null || value.run?.attemptId === attemptId);
    try {
      run = await sessionControls.prepareDirectRun(account);
      const started = run;
      setCalendar((value) => (stillShowing(null)(value) ? { ...value!, run: started } : value));
      // 발주 화면 로그인은 확장 사이트가 확인한다(KID-359 — 로그인 화면이면 실행이 SITE_LOGIN_REQUIRED로 끝난다).
      const { collectCoupangDirectFromExtension } = await import('../lib/coupang-directship-api');
      const data = await collectCoupangDirectFromExtension(started);
      // 끝난 실행은 이 브라우저에서 놓는다 — 다음 불러오기는 새 실행이다. 변환은 이 실행 ID로 다시 잡는다.
      await sessionControls.syncRun(started.attemptId).catch(() => undefined);
      if (!stillShowing(started.attemptId)(calendarRef.current)) return null;
      setCalendar((value) => (stillShowing(started.attemptId)(value)
        ? {
          ...value!,
          operationId: started.attemptId,
          collectedAt: new Date().toISOString(),
          pos: data.pos,
          data,
          run: null,
          refreshing: false,
        }
        : value));
      return { operationId: started.attemptId, data };
    } catch (error) {
      // 운영자 중단이 이 조회를 끊었으면 terminal 은 owner 취소의 몫이다(KID-159).
      const stopped = run
        ? !(await sessionControls.failRunUnlessStopped(
          run,
          'COLLECTION_FAILED',
          `${account.name} 발주 조회에 실패했습니다: ${friendlyError(error) ?? '조회 실패'}`,
        ))
        : false;
      if (run) sessionControls.releaseRun(account.key, run.attemptId);
      // 마지막 수집분은 그대로 보여 준다.
      setCalendar((value) => (value?.account === account && value.refreshing
        ? { ...value, run: null, refreshing: false }
        : value));
      if (stopped) {
        toast.info(COLLECTION_STOPPED_MESSAGE);
        return null;
      }
      // 이미 수집 중인 직배송은 실패가 아니다. 카드의 공용 컨트롤이 그 수집을 그린다.
      if (alreadyRunning(error)) return null;
      toast.error(error instanceof Error ? error.message : '쿠팡 발주를 불러오지 못했습니다.');
      return null;
    }
  }, [alreadyRunning, sessionControls, setCalendar]);

  const refresh = useCallback(async () => {
    await captureAnew();
  }, [captureAnew]);

  /**
   * 고른 날짜의 수집. 변환은 늘 쿠팡에서 새로 받은 값으로 한다 — 보이는 캡처가 아무리 최근이어도 새 실행을 먼저 열고,
   * 그 실행 ID로만 변환한다. 새 캡처에 없는 날짜(그새 발주확정이 아니게 된 발주)는 알리고 빼며, 남은 날짜가 없으면
   * 아무것도 변환하지 않고 새 캡처로 달력을 다시 보여 준다.
   */
  const collectDates = useCallback(async (eddDates: string[]) => {
    const current = calendarRef.current;
    if (!current || eddDates.length === 0) return;
    const { account } = current;
    const fresh = await captureAnew();
    if (!fresh) return;
    const present = new Set(fresh.data.pos.map((po) => String(po.edd ?? '').slice(0, 10)));
    const kept = eddDates.filter((date) => present.has(date));
    const gone = eddDates.filter((date) => !present.has(date));
    if (gone.length > 0) {
      toast.info(kept.length > 0
        ? `새로 불러온 발주에 ${gone.join(', ')} 입고예정 발주가 없어 나머지 날짜만 수집합니다.`
        : `새로 불러온 발주에 ${gone.join(', ')} 입고예정 발주가 없어 수집하지 않았습니다.`);
    }
    if (kept.length === 0) return;
    setCalendar(null);
    await collect(account, fresh.operationId, { eddDates: kept, data: fresh.data });
  }, [captureAnew, collect, setCalendar]);

  const close = useCallback(() => {
    const current = calendarRef.current;
    setCalendar(null);
    if (current?.run) {
      void sessionControls.cancelRun(current.account).catch((error: unknown) => {
        toast.error(friendlyError(error) ?? `${current.account.name} 수집 중단에 실패했습니다.`);
      });
    }
  }, [sessionControls, setCalendar]);

  return { calendar, open, refresh, collect: collectDates, close };
}
