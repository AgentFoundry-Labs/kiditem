'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { buildProductContentEditorHref } from '@/app/(catalog)/product-content/lib/product-content-routing';

/**
 * Compatibility redirect for legacy notification/bookmark hrefs.
 *
 * `/sourcing/[id]/editor` is not a canonical surface anymore; product content
 * editing belongs under `/product-content`. Keep this thin route so existing
 * staging alerts and copied links do not strand users on a 404.
 */
export default function LegacySourcingEditorRedirectPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const productId = String(params.id ?? '');
  const generationId =
    search.get('generationId') ??
    search.get('boldId') ??
    search.get('kpId') ??
    search.get('agentId');

  useEffect(() => {
    if (!productId) return;
    router.replace(buildProductContentEditorHref({ productId, generationId }));
  }, [generationId, productId, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--surface-sunken)]">
      <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
    </div>
  );
}
