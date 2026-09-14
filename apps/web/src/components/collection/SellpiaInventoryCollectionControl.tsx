'use client';

import { useSellpiaInventoryCollection } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';
import { CollectionStartControl } from './CollectionStartControl';

/**
 * The shared Sellpia inventory control for a screen that needs a fresh
 * generation before the operator continues, used by Supply's purchase orders
 * and the Rocket order review. It only collects; the screen's own action is
 * pressed again afterwards.
 */
export function SellpiaInventoryCollectionControl({ className }: { className?: string }) {
  const { control } = useSellpiaInventoryCollection();
  return (
    <CollectionStartControl
      control={control}
      startLabel="셀피아 재고 수집"
      startTitle="셀피아 현재고를 수집합니다. 수집이 끝나면 하던 작업을 다시 눌러 주세요."
      onStart={() => control.start()}
      onStop={control.stop}
      className={className}
    />
  );
}
