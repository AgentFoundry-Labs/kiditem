'use client';

import { formatNumber } from '@/lib/utils';
import {
  toastNoNewOrders,
  type BrowserMallCollectionResult,
} from './browser-mall-collection';
import {
  detectOrderCollectionSessionExtension,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';
import {
  hasSellpiaTransmissionRequest,
  todayYmd,
  type ConversionHistoryItem,
} from './order-collection-page-model';
import { COUPANG_DIRECT_MALL_KEY } from './coupang-directship-collection-source';
import type {
  CoupangDirectData,
  CoupangDirectPo,
  CoupangTransport,
} from './coupang-directship-api';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

/**
 * 입고예정일 달력이 고른 것. 달력을 거치지 않은 수집은 선택 없이 전량을 가져온다.
 * 달력이 이미 발주를 받아 두었으면 그 자료(`data`)를 그대로 쓴다 — 같은 화면을 두 번
 * 열지 않는다.
 */
export type CoupangDirectshipSelection = Readonly<{
  eddDates: readonly string[];
  data?: CoupangDirectData;
}>;

export type CoupangDirectshipCollectorOptions = Readonly<{
  rocketChannelAccountId: string | null;
  addGeneratedFile: (historyItem: ConversionHistoryItem) => void;
  setPreviewId: (id: string) => void;
}>;

/** 운송유형은 서로 독립이다 — 한쪽이 비어도 다른 쪽은 그대로 수집한다. */
const TRANSPORTS: readonly CoupangTransport[] = ['SHIPMENT', 'MILKRUN'];

/**
 * 쿠팡 직배송 수집 절차.
 *
 * 몰 수집 루프와 나란히 서는 또 하나의 절차다. 몰 루프가 이 원천을 특례로 알아보던
 * 동안 로그인·시작·수집 절차가 루프 안에 흩어져, 루프를 고칠 때마다 직배송을 따로
 * 검증해야 했다(KID-255). 로그인을 언제 넣을지도, 발주를 어떻게 나눠 파일로 만들지도
 * 여기서 끝난다.
 */
export function createCoupangDirectshipCollector({
  rocketChannelAccountId,
  addGeneratedFile,
  setPreviewId,
}: CoupangDirectshipCollectorOptions) {
  return async function collectCoupangDirectship(
    account: OrderCollectionMallAccount,
    run: OrderCollectionExtensionRun,
    selection?: CoupangDirectshipSelection,
  ): Promise<BrowserMallCollectionResult> {
    if (!rocketChannelAccountId) {
      throw new Error('활성 쿠팡 로켓 채널 계정을 먼저 선택해 주세요.');
    }
    const {
      COUPANG_TRANSPORT_LABEL,
      collectCoupangDirectFromExtension,
      convertCoupangDirectToSellpiaFile,
    } = await import('./coupang-directship-api');
    const capturedData = selection?.data;
    // 달력이 이미 받아 둔 자료로 만드는 수집은 확장을 부르지 않는다.
    const extensionId = run.extensionId
      ?? (capturedData ? undefined : await detectOrderCollectionSessionExtension());
    if (!extensionId && !capturedData) {
      throw new Error('주문수집 확장프로그램을 찾을 수 없습니다.');
    }
    const collectionDate = run.date ?? todayYmd();
    const activeRun: OrderCollectionExtensionRun = {
      ...run,
      ...(extensionId ? { extensionId } : {}),
      date: collectionDate,
    };
    // 발주 화면 로그인은 확장 사이트가 확인한다(로그인 화면이면 실행이 SITE_LOGIN_REQUIRED로 끝난다, KID-359) —
    // 몰 소유자의 자동 로그인으로 감싸지 않는다(2026-09-21 라이브: 몰 쪽에 없는 시도를 조회해 404).
    const collectedData = capturedData ?? await collectCoupangDirectFromExtension(activeRun);
    // 달력에서 고른 입고예정일이 있으면 그 발주만 넘긴다. 서버 계약(pos 전량 전달)은
    // 그대로 두고 목록만 좁히므로 변환·워크북 매칭 로직은 건드리지 않는다.
    // 달력은 유형을 합쳐 보여주므로 선택한 날짜의 쉽먼트·밀크런을 모두 남긴다.
    // 파일은 운송유형별로 나뉘어 생성된다(셀피아 양식이 그렇게 나뉜다).
    const wanted = selection ? new Set(selection.eddDates) : null;
    const data = wanted
      ? {
          ...collectedData,
          pos: collectedData.pos.filter((po) =>
            wanted.has(String(po.edd ?? '').slice(0, 10))),
        }
      : collectedData;
    let totalOrders = 0;
    let lastId: string | null = null;
    // 서버는 해당 유형에 발주확정 건이 없으면 예외를 던지므로, 여기서 잡지 않으면
    // 쉽먼트가 비어 있을 때 밀크런은 시도조차 못 하고 수집이 끝난다.
    const emptyTransports: string[] = [];
    for (const transport of TRANSPORTS) {
      const matchingPos = data.pos.filter((po) => String(po.transport ?? '').toUpperCase() === transport);
      const label = COUPANG_TRANSPORT_LABEL[transport];
      let conversion: Awaited<ReturnType<typeof convertCoupangDirectToSellpiaFile>>;
      try {
        conversion = await convertCoupangDirectToSellpiaFile(data, transport, {
          channelAccountId: rocketChannelAccountId,
          download: false,
          signal: activeRun.signal,
          run: activeRun,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 서버가 "해당 유형에 발주확정 건 없음"으로 거절한 것은 실패가 아니라 빈 결과다.
        if (/주문이?\s*없/.test(message)) {
          emptyTransports.push(label);
          continue;
        }
        throw err;
      }
      if (!conversion.file) {
        emptyTransports.push(label);
        continue;
      }
      if (!conversion.transmissionIntentKey) {
        throw new Error('쿠팡 로켓 수집 식별 정보가 없어 파일을 저장하지 않았습니다.');
      }
      const result = conversion.file;
      // 수집한 발주는 전부 파일에 담긴다 — 표시 건수는 발주 기준(sourceRows)으로 맞춘다.
      const itemRows = result.outputRows ?? 0;
      const orderNumbers = coupangDirectOrderNumbers(matchingPos);
      const poCount = result.sourceRows || orderNumbers.length || matchingPos.length;
      totalOrders += poCount;
      const unmatchedLabel = conversion.workbookUnmatchedRows > 0
        ? ` · 워크북 미매칭 ${formatNumber(conversion.workbookUnmatchedRows)}품목 포함`
        : '';
      const historyItem = {
        ...result,
        id: conversion.transmissionIntentKey,
        sourceName: `쿠팡직배송 ${label} (${formatNumber(poCount)}건 · ${formatNumber(itemRows)}품목${unmatchedLabel})`,
        convertedAt: Date.now(),
        collectionDate,
        collectionMode: 'browser' as const,
        collectedRows: poCount,
        // 파일을 찾는 쪽(`sentDirectshipOrderNumbers`, 달력의 소거 목록)과 같은 키를 적는다 —
        // 계정 행의 키를 따라가면 그 행이 달리 서는 날 이미 보낸 발주가 달력에 남는다.
        mallKey: COUPANG_DIRECT_MALL_KEY,
        mallName: `쿠팡직배송 ${label}`,
        orderNumbers,
        rocketWorkbookExportId: conversion.rocketWorkbookExportId,
        transmissionIntentKey: conversion.transmissionIntentKey,
      };
      addGeneratedFile(historyItem);
      lastId = historyItem.id;
    }
    if (data.pos.length === 0) {
      toastNoNewOrders('쿠팡직배송', '발주확정 상태 기준');
    } else if (emptyTransports.length > 0) {
      // 어떤 유형이 왜 안 나왔는지 알려준다. 조용히 건너뛰면 "밀크런은 왜 안 가져오냐"가 된다.
      toastNoNewOrders(`쿠팡직배송 ${emptyTransports.join('·')}`, '발주확정 상태 기준');
    }
    if (lastId) setPreviewId(lastId);
    return { rowCount: totalOrders, masked: false, date: collectionDate };
  };
}

/**
 * 이미 셀피아로 전송을 요청한 직배송 발주번호. 입고예정일 달력이 이 발주를 빼고 남은
 * 일만 보여 준다.
 *
 * 기준은 "파일 생성"이 아니라 "셀피아 전송 요청"이다. 파일만 만들고 전송 대기 중인
 * 발주는 아직 처리해야 할 일이 남아 있는데, 파일 기준으로 빼면 달력에서 사라져
 * 38건 중 9건만 남는 것처럼 보인다.
 */
export function sentDirectshipOrderNumbers(
  history: readonly ConversionHistoryItem[],
): Set<string> {
  return new Set(
    history
      .filter((item) => item.mallKey === COUPANG_DIRECT_MALL_KEY
        && hasSellpiaTransmissionRequest(item))
      .flatMap((item) => item.orderNumbers ?? []),
  );
}

function coupangDirectOrderNumbers(pos: CoupangDirectPo[]): string[] {
  const numbers = new Set<string>();
  for (const po of pos) {
    const seq = String(po.seq ?? '').trim();
    if (seq) numbers.add(seq);
  }
  return [...numbers];
}
