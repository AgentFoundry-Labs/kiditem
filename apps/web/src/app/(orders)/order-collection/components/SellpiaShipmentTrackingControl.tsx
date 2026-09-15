'use client';

import { useMemo } from 'react';
import { CollectionStopOnlyControl } from '@/components/collection/CollectionStopOnlyControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { sellpiaShipmentTrackingCollectionSource } from '../lib/sellpia-shipment-tracking-collection-source';

/**
 * 셀피아 송장 조회의 진행 중 표시와 중단. 시작은 몰 카드의 "송장 업로드"가 그대로
 * 하고(부른 쪽이 송장 행을 받아 간다), 이 컨트롤은 owner가 말하는 진행 중과
 * 운영자 중단만 맡는다(KID-159).
 */
export function SellpiaShipmentTrackingControl() {
  const adapter = useMemo(() => sellpiaShipmentTrackingCollectionSource(), []);
  const control = useCollectionSourceControl(adapter);

  return <CollectionStopOnlyControl control={control} label="셀피아 송장 조회" />;
}
