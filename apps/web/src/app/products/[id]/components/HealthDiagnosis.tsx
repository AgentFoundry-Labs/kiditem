'use client';

import {
  Shield,
  XCircle,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import type { ProductCatalogDetail as Product } from '@kiditem/shared';
import type { ActivityEvent } from '../page';

interface HealthDiagnosisProps {
  product: Product;
  violations: ActivityEvent[];
}

export default function HealthDiagnosis({
  product,
  violations,
}: HealthDiagnosisProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-slate-500"><Shield size={16} /></span>
        <h3 className="text-sm font-semibold text-slate-700">상품 진단</h3>
      </div>
      <div className="space-y-2">
        {product.healthScore != null ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn('text-2xl font-bold', product.healthScore >= 70 ? 'text-green-600' : product.healthScore >= 40 ? 'text-amber-600' : 'text-red-600')}>{product.healthScore}</span>
                <span className="text-sm text-slate-400">/ 100</span>
              </div>
              <span className={cn('px-2 py-0.5 rounded text-xs font-medium', product.healthScore >= 70 ? 'bg-green-50 text-green-700' : product.healthScore >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>
                {product.healthScore >= 70 ? '정상' : product.healthScore >= 40 ? '주의' : '위험'}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', product.healthScore >= 70 ? 'bg-green-500' : product.healthScore >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                style={{ width: `${product.healthScore}%` }}
              />
            </div>
            {violations.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <p className="text-xs font-medium text-slate-400">위반 사항 ({violations.length})</p>
                {violations.map((v) => (
                  <div key={v.id} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 mt-0.5">
                      {v.data?.severity === 'critical' ? (
                        <XCircle size={14} className="text-red-500" />
                      ) : v.data?.severity === 'warning' ? (
                        <AlertTriangle size={14} className="text-amber-500" />
                      ) : (
                        <AlertCircle size={14} className="text-blue-500" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-slate-700">{v.title}</p>
                      {v.data?.actionType && (
                        <p className="text-xs text-slate-400 mt-0.5">추천: {v.data.actionType}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {product.healthUpdatedAt && (
              <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                마지막 평가: {timeAgo(product.healthUpdatedAt)}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-3">
            <p className="text-sm text-slate-400">아직 평가되지 않았습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
