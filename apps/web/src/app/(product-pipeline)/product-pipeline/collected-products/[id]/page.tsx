'use client';

import { useParams, useSearchParams } from 'next/navigation';
import {
  COLLECTED_PRODUCTS_ROOT,
  collectedProductDetailHref,
  normalizeProductPipelineReturnTo,
} from '../../_shared/lib/product-pipeline-routes';
import { ProductWorkspaceScreen } from '../../_shared/components/workspace/ProductWorkspaceScreen';

export default function ProductDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id as string;
  const returnTo = normalizeProductPipelineReturnTo(searchParams.get('returnTo'));

  return (
    <ProductWorkspaceScreen
      productId={productId}
      backHref={returnTo ?? COLLECTED_PRODUCTS_ROOT}
      selfHref={collectedProductDetailHref(productId, { returnTo })}
    />
  );
}
