'use client';

import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { sellpiaProductProfitabilityCollection } from '@/lib/sellpia-product-profitability-collection';
import { useSellpiaInventoryCollection } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';

/**
 * Product Management's two Sellpia sources, one control each, so each source
 * shows its own running state and stop. Neither collection publishes ABC
 * grades; that stays the explicit command in the data-status dialog.
 */
export function ProductOperationsSourceCollections() {
  const { control: inventory } = useSellpiaInventoryCollection();
  const profitability = useCollectionSourceControl(sellpiaProductProfitabilityCollection);

  return (
    <>
      <CollectionStartControl
        control={inventory}
        startLabel="셀피아 재고 수집"
        startTitle="셀피아 현재고를 수집합니다. ABC 등급은 자동 발행하지 않습니다."
        onStart={() => inventory.start()}
        onStop={inventory.stop}
      />
      <CollectionStartControl
        control={profitability}
        startLabel="셀피아 상품 손익 수집"
        startTitle="401일 상품 손익 원천을 수집합니다. ABC 등급은 자동 발행하지 않습니다."
        onStart={() => profitability.start()}
        onStop={profitability.stop}
      />
    </>
  );
}
