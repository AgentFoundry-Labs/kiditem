'use client';

import { Loader2 } from 'lucide-react';
import ProductEditHeader from './ProductEditHeader';

interface Props {
  productId: string;
  onBack: () => void;
}

export default function ProductLoadingView({ productId, onBack }: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProductEditHeader
        productName="불러오는 중..."
        productId={productId}
        isEditComplete={false}
        isLocked={false}
        onToggleEditComplete={() => {}}
        onToggleLocked={() => {}}
        onBack={onBack}
      />
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm font-medium">상품 정보를 불러오고 있습니다...</p>
        </div>
      </div>
    </div>
  );
}
