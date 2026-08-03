'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function RocketDeterministicMatchingPanel({
  channelAccountId,
}: {
  channelAccountId: string;
}) {
  return (
    <section aria-label="로켓 Sellpia 구성 매칭" className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">상품·재고 매칭</h3>
          <p className="mt-1 text-sm text-slate-600">
            로켓 채널 옵션의 상품 연결과 판매 1개당 Sellpia 재고 차감 수량은 상품 매칭 센터에서 관리합니다.
          </p>
        </div>
        <Link
          href={`/product-hub/matching?channelAccountId=${encodeURIComponent(channelAccountId)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-bold text-purple-800 hover:border-purple-500"
        >
          상품 매칭 센터 <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
