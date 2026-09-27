'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { registrationTargetApi, registrationTargetKeys } from '@/lib/registration-target-api';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import type { MallPublishItem } from '../../_shared/mall-publish-adapter';
import { valuesForTarget } from '../../_shared/target-registration-execution';

/** 미리보기로 읽는 상품 수 — 3단계 미리보기 줄 수와 같다(상품마다 조회 2번, 단계를 열 때 한 번). */
const SAVED_VALUE_ITEMS = 5;

function salesProductIdOf(item: MallPublishItem): string | null {
  return item.source === 'candidate' ? item.salesProductId ?? null : item.candidateId;
}

/**
 * 마법사 3단계가 보여 줄 저장된 몰별 값(QA D5). 등록 실행이 얼리는 층 그대로 — 판매상품의 몰별 값(`channelOverrides`)
 * < 그 몰 계정 등록 설정의 몰 문서(`registrationInput`) — 를 합친다(`valuesForTarget`). 어댑터 기본값과 이번 편집은
 * 화면이 따로 얹는다. 키는 `${상품 id}:${몰 키}`.
 */
export function useSavedMallValues(
  items: readonly MallPublishItem[],
  mallKeys: readonly string[],
  channelAccountIds: Readonly<Record<string, string>>,
): ReadonlyMap<string, Record<string, string>> {
  const subjects = useMemo(
    () => items.slice(0, SAVED_VALUE_ITEMS).flatMap((item) => {
      const salesProductId = salesProductIdOf(item);
      return salesProductId ? [{ item, salesProductId }] : [];
    }),
    [items],
  );
  const products = useQueries({
    queries: subjects.map(({ salesProductId }) => ({
      queryKey: salesProductKeys.detail(salesProductId),
      queryFn: () => salesProductApi.get(salesProductId),
      staleTime: 60_000,
    })),
  });
  const targets = useQueries({
    queries: subjects.map(({ salesProductId }) => ({
      queryKey: registrationTargetKeys.list(salesProductId),
      queryFn: () => registrationTargetApi.list(salesProductId),
      staleTime: 60_000,
    })),
  });
  const productData = products.map((query) => query.data);
  const targetData = targets.map((query) => query.data);

  return useMemo(() => {
    const saved = new Map<string, Record<string, string>>();
    subjects.forEach(({ item }, index) => {
      const product = productData[index];
      const itemTargets = targetData[index] ?? [];
      for (const mallKey of mallKeys) {
        const target = itemTargets.find((candidate) => candidate.channelAccountId === channelAccountIds[mallKey]);
        const values = valuesForTarget({
          registrationInput: (target?.registrationInput ?? {}) as Record<string, unknown>,
          mallKey,
          overrideValues: product?.channelOverrides.find((override) => override.mallKey === mallKey)?.adapterValues ?? null,
        });
        if (Object.keys(values).length > 0) saved.set(`${item.candidateId}:${mallKey}`, values);
      }
    });
    return saved;
    // 조회 결과 배열은 매 렌더 새로 만들어진다 — 담긴 값으로 비교한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, mallKeys, channelAccountIds, JSON.stringify(productData), JSON.stringify(targetData)]);
}
