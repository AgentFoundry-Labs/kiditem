import Link from 'next/link';
import { ExternalLink, History } from 'lucide-react';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';
import { formatDateTime } from '@/lib/utils';

export function InfoCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon ? <span className="text-slate-500">{icon}</span> : null}
        {title}
      </h2>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-all text-right text-slate-900">{value}</dd>
    </div>
  );
}

export default function ProductSidebar({ product }: { product: InventorySkuSnapshotItem }) {
  return (
    <aside className="space-y-6">
      <InfoCard title="속성">
        <InfoRow
          label="상태"
          value={<span className={`rounded px-2 py-0.5 text-xs font-medium ${product.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{product.isActive ? '활성' : '비활성'}</span>}
        />
        <InfoRow label="ABC등급" value="계산 데이터 없음" />
        <InfoRow label="광고 티어" value="계산 데이터 없음" />
        <InfoRow label="바코드" value={<span className="font-mono text-xs">{product.barcode || '-'}</span>} />
      </InfoCard>

      <InfoCard title="링크">
        <p className="text-sm text-slate-400">등록된 외부 상세페이지 링크 없음</p>
        <Link href="/product-hub/matching" className="mt-2 inline-flex items-center gap-1.5 text-sm text-purple-600 hover:underline">
          <ExternalLink size={13} aria-hidden="true" /> 상품 매칭 센터
        </Link>
      </InfoCard>

      <InfoCard title="Sellpia 가져오기 출처" icon={<History size={16} aria-hidden="true" />}>
        <InfoRow label="마지막 가져오기" value={formatDateTime(product.lastImportedAt)} />
        <InfoRow label="Import Run ID" value={<span className="font-mono text-xs">{product.lastImportRunId || '-'}</span>} />
        <p className="pt-2 text-xs leading-5 text-slate-400">
          상품과 재고는 이 화면에서 수정하지 않으며, 다음 Sellpia 엑셀 가져오기 결과가 반영됩니다.
        </p>
      </InfoCard>
    </aside>
  );
}
