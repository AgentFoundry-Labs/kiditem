'use client';

import { useParams } from 'next/navigation';
import {
  COLLECTED_PRODUCTS_ROOT,
  collectedProductDetailHref,
} from '../../_shared/lib/product-pipeline-routes';
import { ProductWorkspaceScreen } from '../../_shared/components/workspace/ProductWorkspaceScreen';

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;

  return (
    <ProductWorkspaceScreen
      productId={productId}
      backHref={COLLECTED_PRODUCTS_ROOT}
      selfHref={collectedProductDetailHref(productId)}
    />
  );
}
