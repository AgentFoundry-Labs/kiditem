import { Boxes, ChartNoAxesCombined, History, Tags } from 'lucide-react';
import {
  deriveProductInventoryStatus,
  PRODUCT_INVENTORY_LABELS,
  type MasterProductOperationsDetail,
} from '@kiditem/shared/product-operations';
import { formatDateTime, formatKRW, formatNumber } from '@/lib/utils';
import { isInternalProductCode } from '@/lib/operator-product-reference';
import { ProductAbcBadge } from '@/components/product-abc/ProductAbcBadge';

export default function ProductInfoCards({
  product,
  onOpenAbcDetail,
}: {
  product: MasterProductOperationsDetail;
  onOpenAbcDetail: () => void;
}) {
  const hasVisibleDisplayReference = product.displayReference.type !== 'product_code'
    || !isInternalProductCode(product.displayReference.value);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoCard title="상품 운영 정보" icon={<Tags size={16} />}>
        {hasVisibleDisplayReference ? <InfoRow
          label={product.displayReference.label}
          value={<span className="font-mono">{product.displayReference.value}</span>}
        /> : null}
        <InfoRow label="카테고리" value={product.category ?? '미등록'} />
        <InfoRow label="브랜드" value={product.brand ?? '미등록'} />
        <InfoRow label="ABC 등급" value={
          <button
            type="button"
            onClick={onOpenAbcDetail}
            aria-label={`${product.name} ABC 근거 보기`}
            className="rounded-md p-1 transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            <ProductAbcBadge grade={product.abcGrade} evaluation={product.abcEvaluation} showConfidence />
          </button>
        } />
        <InfoRow label="태그" value={product.tags.length > 0 ? product.tags.join(', ') : '미등록'} />
      </InfoCard>

      <InfoCard title="재고 요약" icon={<Boxes size={16} />}>
        <InfoRow label="물리 재고 합계" value={product.inventoryUnits === null
          ? '미수집'
          : `${formatNumber(product.inventoryUnits)}개`} />
        <InfoRow label="재고 상태" value={PRODUCT_INVENTORY_LABELS[deriveProductInventoryStatus(product)]} />
        <InfoRow label="채널 판매 옵션" value={`${formatNumber(product.channelListings.reduce((sum, listing) => sum + listing.options.length, 0))}개`} />
        <p className="pt-2 text-xs leading-5 text-[var(--text-tertiary)]">
          재고 수량은 이 상품에 속한 Sellpia SKU의 확인된 물리 재고입니다.
        </p>
      </InfoCard>

      <InfoCard title="광고 · 수익 설정" icon={<ChartNoAxesCombined size={16} />}>
        <InfoRow label="광고 예산 한도" value={product.adBudgetLimit === null ? '미설정' : `${formatKRW(product.adBudgetLimit)}원`} />
        <InfoRow label="손익 태그" value={product.profitTag ?? '미설정'} />
      </InfoCard>

      <InfoCard title="변경 기록" icon={<History size={16} />}>
        <InfoRow label="생성" value={formatDateTime(product.createdAt)} />
        <InfoRow label="최근 수정" value={formatDateTime(product.updatedAt)} />
        <InfoRow label="연결 채널" value={`${formatNumber(product.channelListings.length)}개`} />
        <p className="pt-2 text-xs leading-5 text-[var(--text-tertiary)]">
          상품 메타데이터와 옵션 레시피는 여기에서 관리하고, 물리 재고는 Sellpia 동기화가 소유합니다.
        </p>
      </InfoCard>
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <span className="text-[var(--text-tertiary)]">{icon}</span> {title}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-[var(--text-tertiary)]">{label}</dt>
      <dd className="min-w-0 break-all text-right font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
