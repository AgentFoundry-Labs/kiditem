'use client';

import SellpiaImportHistory from './SellpiaImportHistory';
import SellpiaInventoryImport from './SellpiaInventoryImport';

export default function SellpiaSyncWorkspace() {
  return (
    <div className="space-y-8">
      <SellpiaInventoryImport />
      <SellpiaImportHistory />
    </div>
  );
}
