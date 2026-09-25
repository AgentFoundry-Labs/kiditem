'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SELLPIA_SHIPMENT_TRACKING_KIND } from '@kiditem/shared/orders-operations';
import { todayYmd } from '../lib/order-collection-page-model';
import { orderOperationsQueryKey } from '../lib/order-operations';
import { collectSellpiaShipmentTracking } from '../lib/sellpia-shipment-tracking';

/**
 * 송장 업로드가 부르는 셀피아 송장 조회(KID-359 H3). 한 화면에서 겹쳐 누르지 않게만 막고, 겹치는 다른 브라우저의
 * 조회는 서버 잠금(`resource:sellpia:login`)이 거절한다. 끝나면 공용 컨트롤의 실행 읽기를 새로 한다.
 */
export function useSellpiaShipmentTracking() {
  const queryClient = useQueryClient();
  const startingRef = useRef(false);

  const collect = useCallback(async () => {
    if (startingRef.current) throw new Error('셀피아 송장 조회가 이미 시작되었습니다.');
    startingRef.current = true;
    try {
      return await collectSellpiaShipmentTracking(todayYmd());
    } finally {
      startingRef.current = false;
      void queryClient.invalidateQueries({ queryKey: orderOperationsQueryKey(SELLPIA_SHIPMENT_TRACKING_KIND) });
    }
  }, [queryClient]);

  return { collect };
}
