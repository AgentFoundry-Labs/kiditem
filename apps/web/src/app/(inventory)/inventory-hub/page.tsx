'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageSkeleton from '@/components/ui/PageSkeleton';
import ReturnTransfers from '../stock-ops/components/ReturnTransfers';
import StockTransfers from '../stock-ops/components/StockTransfers';
import { InventoryWorkspace } from './components/InventoryWorkspace';

export default function InventoryHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <InventoryHubContent />
    </Suspense>
  );
}

function InventoryHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasTab = searchParams.has('tab');
  const canonicalParams = new URLSearchParams(searchParams.toString());
  canonicalParams.delete('tab');
  const query = canonicalParams.toString();
  const canonicalHref = query ? `/inventory-hub?${query}` : '/inventory-hub';

  useEffect(() => {
    if (hasTab) router.replace(canonicalHref);
  }, [canonicalHref, hasTab, router]);

  if (hasTab) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-10">
      <InventoryWorkspace />
      <HubSection><StockTransfers /></HubSection>
      <HubSection><ReturnTransfers /></HubSection>
    </div>
  );
}

/** 한 화면 안에 쌓인 운영 섹션을 구분선으로 나눈다. */
function HubSection({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[var(--border)] pt-10">{children}</div>;
}
