import type { CapabilityResultEnvelope } from '@kiditem/shared/agent-interaction';
import { PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { ConversationCardFrame } from './ConversationCardFrame';

type ResourceReference = CapabilityResultEnvelope['resourceRefs'][number];

/**
 * Compact result projection for an allowlisted resource reference. Gateway
 * tool-status events do not create this card; callers must explicitly supply
 * a result envelope reference.
 */
export function ResourceReferenceCard({ reference }: { reference: ResourceReference }) {
  const presentation = resourcePresentation(reference.kind);
  const href = resourceHref(reference);

  return (
    <ConversationCardFrame
      ariaLabel={presentation.title}
      icon={<PackageSearch size={15} />}
      title={presentation.title}
      subtitle={presentation.subtitle}
      tone="success"
      actions={href ? (
        <Link
          href={href}
          aria-label={`${presentation.title} 열기`}
          className="inline-flex min-h-9 items-center rounded-md border border-emerald-300 px-2.5 py-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          열기
        </Link>
      ) : undefined}
    />
  );
}

function resourcePresentation(kind: string): { title: string; subtitle: string } {
  return RESOURCE_PRESENTATIONS[kind] ?? { title: '업무 결과', subtitle: '결과 정보를 확인할 수 있습니다.' };
}

const RESOURCE_PRESENTATIONS: Record<string, { title: string; subtitle: string }> = {
  channel_listing: { title: '판매 채널 등록', subtitle: '판매 채널 등록 정보를 확인할 수 있습니다.' },
  purchase_order: { title: '발주서', subtitle: '발주서 정보를 확인할 수 있습니다.' },
  sales_product: { title: '판매상품 초안', subtitle: '수집한 상품을 편집하고 등록할 수 있습니다.' },
  sourcing_candidate: { title: '소싱 후보', subtitle: '수집한 원천 기록입니다.' },
  sourcing_recommendation_run: { title: '추천 결과', subtitle: '추천 결과를 확인할 수 있습니다.' },
  sourcing_review_batch: { title: '검토 요청', subtitle: '검토 요청 내용을 확인할 수 있습니다.' },
  sourcing_workspace_evidence: { title: '소싱 근거', subtitle: '소싱 근거를 확인할 수 있습니다.' },
};

function resourceHref(reference: ResourceReference): string | null {
  switch (reference.kind) {
    case 'purchase_order':
      return `/purchase-orders?orderId=${encodeURIComponent(reference.id)}`;
    // 수집상품 화면은 판매상품 초안으로 열린다. 원천 기록(sourcing_candidate)은 열 화면이 없다.
    case 'sales_product':
      return `/product-pipeline/collected-products/${encodeURIComponent(reference.id)}`;
    default:
      return null;
  }
}
