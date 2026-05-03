'use client';

import { AlertCircle } from 'lucide-react';
import ProductEditHeader from '../../components/detail/ProductEditHeader';

interface Props {
  productId: string;
  error: string;
  onBack: () => void;
  onRetry: () => void;
}

export default function ProductErrorView({ productId, error, onBack, onRetry }: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProductEditHeader
        productName="오류"
        productId={productId}
        isEditComplete={false}
        isLocked={false}
        onToggleEditComplete={() => {}}
        onToggleLocked={() => {}}
        onBack={onBack}
      />
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm font-medium">{error}</p>
          <button
            onClick={onRetry}
            className="mt-2 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}
