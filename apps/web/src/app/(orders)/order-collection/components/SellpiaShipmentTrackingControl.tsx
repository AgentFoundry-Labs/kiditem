'use client';

import { useMemo } from 'react';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
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

  if (control.state !== 'running' && control.state !== 'stopping' && !control.notice) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2">
      <span className="text-xs font-medium text-[var(--text-secondary)]">셀피아 송장 조회</span>
      <CollectionStartControl
        control={control}
        startLabel="셀피아 송장 조회"
        onStart={() => undefined}
        onStop={control.stop}
      />
    </div>
  );
}
