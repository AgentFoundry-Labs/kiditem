'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  mallRegisterReadiness,
  mallRegisterValuesWithDefaults,
  normalizeMallRegisterValues,
  EMPTY_MALL_REGISTER_VALUES,
  type MallReadiness,
  type MallRegisterValues,
} from '@/app/(channels)/_shared/mall-register-values';
import { coupangWingAdapter } from '@/app/(channels)/_shared/adapters';
import type { MallPublishItem } from '@/app/(channels)/_shared/mall-publish-adapter';
import { useProductDetail } from '../../_shared/hooks/useProductDetail';
import {
  runMallRegistrations,
  summarizeMallRun,
  type MallRunOutcome,
} from '../lib/mall-quick-register-run';

/**
 * 목록 모달의 몰 등록.
 *
 * 값은 **상품 상세에 저장된 것**을 읽어 쓴다. 모달은 값을 묻지 않는다 — 버튼만
 * 누르고, 못 누르면 왜 못 누르는지 그 자리에서 본다.
 *
 * 판매가를 상세에서 읽는 것이 중요하다. 목록에는 가격 칸이 없어서 목록 값만 보면
 * 늘 "모른다" 가 되고, 그러면 0원 상품도 막지 못한 채 확장까지 간다.
 */
export function useMallQuickRegister(input: {
  /** 판매상품 초안 id. 폼 방식은 화면 하나에 상품 하나다. 여러 개를 골라도 첫 상품만 연다. */
  salesProductId: string | null;
  /** 모달이 닫혀 있으면 상세를 부르지 않는다. */
  enabled: boolean;
}) {
  const { salesProductId, enabled } = input;
  // 묶음으로 동시에 도므로 "도는 몰" 은 하나가 아니다.
  const [runningMallKeys, setRunningMallKeys] = useState<readonly string[]>([]);
  const [results, setResults] = useState<Record<string, MallRunOutcome>>({});
  // 실행 중에 상태가 바뀌어도 두 번 돌지 않게 막는다.
  const running = useRef(false);

  // ⚠️ 상세를 여기서 다시 `useQuery` 로 부르지 않는다. `queryKeys.sourcing.detail(id)` 은
  // `useProductDetail` 이 **워크스페이스 모양**(`{ product, editState, … }`)으로 소유하는
  // 키다. 같은 키에 다른 모양을 써 넣으면 이 모달을 연 뒤 상품 상세로 들어갔을 때
  // `fetchedData.product` 가 undefined 가 되어 화면이 통째로 죽는다(라이브에서 잡음).
  const detailQuery = useProductDetail(salesProductId ?? '', {
    enabled: enabled && Boolean(salesProductId),
  });

  // 상품이 바뀌면 지난 실행 결과를 지운다. 다른 상품의 ✓ 가 남아 있으면 사람은
  // 이 상품이 이미 등록된 줄 안다.
  useEffect(() => {
    setResults({});
  }, [salesProductId]);

  const detail = detailQuery.data?.product ?? null;

  // 구버전 응답에는 `basicInfo` 가 아예 없을 수 있다. 없다고 화면을 깨뜨리지 않는다 —
  // 저장한 값이 없는 것과 같게 다루고, 그러면 기본값으로 채워진 몰만 열린다.
  const basicInfo = detail?.basicInfo ?? null;

  const values: MallRegisterValues = useMemo(
    () => mallRegisterValuesWithDefaults(
      basicInfo
        ? normalizeMallRegisterValues(
          basicInfo.mallRegisterValues,
          basicInfo.mallRegisterShared,
        )
        : EMPTY_MALL_REGISTER_VALUES,
    ),
    [basicInfo],
  );

  const item: MallPublishItem | null = useMemo(() => {
    if (!detail || !salesProductId) return null;
    // 원천 기록이 있는 초안은 수집상품 항목, 없는 초안(직접 작성 · 사방넷)은 판매상품 항목이다 —
    // `MallPublishItem` 이 두 모양에 두는 id 자리를 그대로 따른다.
    const identity = detail.sourceCandidateId
      ? { candidateId: detail.sourceCandidateId, source: 'candidate' as const, salesProductId }
      : { candidateId: salesProductId, source: 'sales_product' as const };
    return {
      ...identity,
      name: basicInfo?.name || detail.name,
      // 0 은 "모른다" 로 접는다. 목록에는 가격 칸이 없으므로 원본 상세 가격으로
      // 보완하고, 끝까지 없으면 null 로 둔다.
      salePrice: basicInfo?.salePrice || detail.price_krw || null,
      thumbnailUrl: detail.thumbnailUrl ?? null,
    };
  }, [detail, basicInfo, salesProductId]);

  const readiness: MallReadiness[] = useMemo(
    () => mallRegisterReadiness(item, values),
    [item, values],
  );

  const readyMallKeys = useMemo(
    () => readiness.filter((row) => row.ready).map((row) => row.mallKey),
    [readiness],
  );

  /**
   * 쿠팡 WING 줄.
   *
   * 폼 몰과 같은 모양으로 그리되 실행 경로는 다르다 — 이 몰만 앱 안에서 확인 창을
   * 거친다(셀피아 SKU 매칭·값 확정). 그래도 "왜 못 보내는가" 는 여기서 다시 적지
   * 않고 어댑터에게 묻는다. 화면이 조건을 따로 적으면 어댑터와 어긋난다.
   */
  const wingReadiness: MallReadiness = useMemo(
    () => mallRegisterReadiness(item, values, [coupangWingAdapter])[0]!,
    [item, values],
  );

  const run = useCallback(async (mallKeys: readonly string[]) => {
    if (running.current || mallKeys.length === 0) return;
    running.current = true;
    try {
      const outcomes = await runMallRegistrations({
        mallKeys,
        item,
        values,
        onStart: (mallKey) => setRunningMallKeys((current) => [...current, mallKey]),
        onOutcome: (outcome) => {
          setRunningMallKeys((current) => current.filter((key) => key !== outcome.mallKey));
          setResults((current) => ({ ...current, [outcome.mallKey]: outcome }));
        },
      });
      const summary = summarizeMallRun(outcomes);
      if (summary.failed.length === 0) {
        toast.success(summary.title, { description: summary.description });
      } else if (summary.filled === 0) {
        toast.error(summary.title, { description: summary.description });
      } else {
        toast.warning(summary.title, { description: summary.description });
      }
    } finally {
      running.current = false;
      setRunningMallKeys([]);
    }
  }, [item, values]);

  return {
    values,
    readiness,
    readyMallKeys,
    wingReadiness,
    results,
    runningMallKeys,
    /** 저장된 값을 아직 못 읽었다. 이 동안은 버튼을 열지 않는다. */
    isLoading: detailQuery.isLoading,
    loadError: detailQuery.isError,
    // 고른 몰만 묶음으로. 기다릴 수 있게 프라미스를 돌려준다 — 쿠팡 WING 은 폼 몰이
    // 다 끝난 뒤에 확인 창을 띄워야 해서 호출부가 순서를 잡는다.
    runMalls: useCallback((mallKeys: readonly string[]) => run(mallKeys), [run]),
  };
}
