'use client';

import { useMemo } from 'react';
import { WING_CATALOG_EXCEL_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import {
  accountCatalogOperations,
  wingCatalogCollection,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/wing-catalog-collection';
import { describeWingCatalogOperation } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/wing-catalog-progress';

const START_TITLE = '쿠팡 윙에 쿠팡상품정보 엑셀 생성을 요청하고, 만들어지면 받아서 반영합니다(1,260개 약 7분).';

/**
 * 쿠팡상품정보 갱신(KID-351 작업 ②): 확장이 윙에 엑셀 생성을 요청해 진행률을 보고, 끝나면 파일을 받아 서버가
 * 반영한다(`channels.wing_catalog_excel`). 생성 동안 계정 잠금을 쥐므로 그 사이 상품 받기(동기화)는 시작되지 않는다.
 */
export function CoupangCatalogExcelRefresh({
  channelAccountId,
  accountName,
}: {
  channelAccountId: string;
  accountName: string | null;
}) {
  const adapter = useMemo(
    () => wingCatalogCollection(
      { id: channelAccountId, name: accountName },
      { startKind: WING_CATALOG_EXCEL_KIND, label: '쿠팡상품정보 갱신' },
    ),
    [channelAccountId, accountName],
  );
  const control = useCollectionSourceControl(adapter);
  const latest = accountCatalogOperations(control.status, channelAccountId)
    .find((operation) => operation.kind === WING_CATALOG_EXCEL_KIND) ?? null;
  const view = latest ? describeWingCatalogOperation(latest) : null;

  return (
    <div className="space-y-1.5">
      <CollectionStartControl
        control={control}
        startLabel="쿠팡상품정보 갱신"
        startTitle={START_TITLE}
        onStart={() => control.start()}
        onStop={control.stop}
      />
      {view && (
        <div className="text-xs text-slate-600" aria-live="polite">
          <p className="font-semibold">{view.phase}</p>
          {view.detail && <p>{view.detail}</p>}
          {view.tone === 'running' && (
            <p className="text-amber-700">엑셀 생성 중에는 상품 받기(동기화)를 시작할 수 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
